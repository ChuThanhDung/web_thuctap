"""Trợ lý xếp bộ: thả file lẫn lộn vào hộp chờ, trợ lý đề xuất bộ, người dùng xác nhận thì mới tạo bộ."""

import random
from pathlib import Path

import pytest

from src.services.batch_sorter import SortFile, score_pair, sort_files
from tests.test_api.test_billing_and_limits import login, make_company

GOLDEN = Path(__file__).resolve().parents[2] / "dataset" / "golden"
SETS = ("golden_001_small_match", "golden_002_small_match", "golden_003_small_match")
FILES = (("po", "01_purchase_order.xml"), ("grn", "02_goods_receipt.xml"), ("invoice", "03_invoice.xml"))


async def fill_inbox(client, headers, sets=SETS):
    inbox = (await client.get("/api/v1/agent/inbox", headers=headers)).json()
    uploads = [(set_name, doc_type, name) for set_name in sets for doc_type, name in FILES]
    random.Random(7).shuffle(uploads)
    owner: dict[int, str] = {}
    for set_name, _doc_type, name in uploads:
        response = await client.post(
            "/api/v1/uploads",
            headers=headers,
            data={"doc_type": "auto", "batch_id": str(inbox["batch_id"])},
            files={"file": (name, (GOLDEN / set_name / name).read_bytes(), "application/xml")},
        )
        assert response.status_code == 200, response.text
        owner[response.json()["id"]] = set_name
    return inbox["batch_id"], owner


@pytest.mark.asyncio
async def test_mixed_files_are_sorted_into_their_own_batches_without_ai(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    _inbox_id, owner = await fill_inbox(client, headers)

    # Hộp chờ không hiện như một bộ và không bị đối soát.
    listed = (await client.get("/api/v1/uploads/batches", headers=headers)).json()["items"]
    assert listed == []

    proposal = (await client.post("/api/v1/agent/sort", headers=headers)).json()
    assert proposal["ai_used"] is False
    assert proposal["unsorted"] == []
    assert len(proposal["groups"]) == 3
    for group in proposal["groups"]:
        assert group["complete"] is True
        assert len({owner[file_id] for file_id in group["files"].values()}) == 1, group
        assert group["reasons"]

    groups = [group["files"] for group in proposal["groups"]]
    created = await client.post("/api/v1/agent/sort/apply", headers=headers, json={"groups": groups})
    assert created.status_code == 200, created.text
    assert len(created.json()["batches"]) == 3

    listed = (await client.get("/api/v1/uploads/batches", headers=headers)).json()["items"]
    assert len(listed) == 3
    assert {item["reconciliation_status"] for item in listed} == {"matched"}
    usage = (await client.get("/api/v1/agent/status", headers=headers)).json()
    assert usage["used"] == 0
    inbox = (await client.get("/api/v1/agent/inbox", headers=headers)).json()
    assert inbox["files"] == []


@pytest.mark.asyncio
async def test_apply_rejects_files_outside_the_inbox_or_in_the_wrong_slot(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    _inbox_id, owner = await fill_inbox(client, headers, sets=SETS[:1])
    proposal = (await client.post("/api/v1/agent/sort", headers=headers)).json()
    files = proposal["groups"][0]["files"]

    swapped = {"po": files["invoice"], "invoice": files["po"], "grn": files["grn"]}
    response = await client.post("/api/v1/agent/sort/apply", headers=headers, json={"groups": [swapped]})
    assert response.status_code == 400

    response = await client.post("/api/v1/agent/sort/apply", headers=headers, json={"groups": [{"po": 999999}]})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_inbox_is_private_to_its_owner(client):
    _, chief, accountant = make_company(plan="pro")
    accountant_headers = await login(client, accountant)
    inbox_id, owner = await fill_inbox(client, accountant_headers, sets=SETS[:1])
    chief_headers = await login(client, chief)
    some_file = next(iter(owner))
    assert (await client.get(f"/api/v1/uploads/{some_file}/file", headers=chief_headers)).status_code == 404
    response = await client.post("/api/v1/agent/sort", headers=chief_headers)
    assert response.status_code == 400  # hộp chờ của KTT trống: không thấy file của người khác


@pytest.mark.asyncio
async def test_sort_needs_files(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    assert (await client.post("/api/v1/agent/sort", headers=headers)).status_code == 400


def _file(upload_id, doc_type, tax="0101", po="PO-1", items=("Bóng đèn", "Ổ cắm"), supplier="Nam Việt"):
    return SortFile(
        upload_id,
        doc_type,
        {
            "supplier_tax_id": tax,
            "supplier_name": f"Công ty TNHH {supplier}",
            "po_number": po,
            "line_items": [{"item_name": name, "qty": 1} for name in items],
        },
    )


def test_different_tax_ids_never_end_up_together():
    assert score_pair(_file(1, "po"), _file(2, "invoice", tax="0202")).score < 0


def test_twin_orders_are_flagged_as_ambiguous():
    # Hai PO giống hệt (cùng nhà cung cấp, cùng hàng) và hóa đơn không ghi số PO: quy tắc không phân biệt được.
    files = [
        _file(1, "po", po="PO-1"),
        _file(2, "po", po="PO-2"),
        _file(3, "invoice", po=None),
    ]
    result = sort_files(files)
    assert result.ambiguous and result.ambiguous[0]["upload_id"] == 3


def test_a_file_that_matches_nothing_stays_unsorted():
    files = [_file(1, "po"), _file(2, "invoice"), _file(3, "grn", tax="0999", supplier="Khác hẳn", po="PO-9")]
    result = sort_files(files)
    assert 3 in result.unsorted
    assert result.groups[0].files == {"po": 1, "invoice": 2}


def test_ai_settles_an_ambiguous_file_once_and_only_within_offered_groups(monkeypatch):
    from src.services import agent_sort
    from src.services.agent_llm import AgentMeter

    files = [_file(1, "po", po="PO-1"), _file(2, "po", po="PO-2"), _file(3, "invoice", po=None)]
    by_id = {f.upload_id: f for f in files}
    result = sort_files(files)
    calls = []

    def fake_complete_json(system, user, schema, meter, *, name):
        calls.append(user)
        meter.calls += 1
        target = next(i for i, g in enumerate(result.groups) if g.files.get("po") == 2)
        return {"decisions": [{"file_id": 3, "group": target, "reason": "hàng giao theo PO-2"}]}

    monkeypatch.setattr(agent_sort, "complete_json", fake_complete_json)
    meter = AgentMeter()
    decided = agent_sort.resolve_ambiguous(result, by_id, meter)
    assert len(calls) == 1 and meter.calls == 1
    assert decided == {3: "hàng giao theo PO-2"}
    assert [g.files for g in result.groups] == [{"po": 2, "invoice": 3}]
    # Không gửi giá hay file gốc cho AI.
    assert "price" not in calls[0] and "don_gia" not in calls[0]

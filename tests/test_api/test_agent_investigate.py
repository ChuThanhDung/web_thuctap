"""Trợ lý điều tra: tìm liên lạc loài, chỉ ra liên đúng đang nằm ở bộ nào, đổi chỗ khi người dùng đồng ý."""

from pathlib import Path

import pytest

from src.database import SessionLocal, use_system_context
from src.models.billing import UsageCounter
from src.models.organization import Organization
from src.services import agent_investigate
from src.services.plans import PLAN_LIMITS, AgentUnavailableError, PlanLimitError, current_period, ensure_can_use_agent
from tests.test_api.test_billing_and_limits import login, make_company

GOLDEN = Path(__file__).resolve().parents[2] / "dataset" / "golden"
NAMES = {"po": "01_purchase_order.xml", "grn": "02_goods_receipt.xml", "invoice": "03_invoice.xml"}


async def make_batch(client, headers, sources: dict[str, str]) -> int:
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    for doc_type, set_name in sources.items():
        response = await client.post(
            "/api/v1/uploads",
            headers=headers,
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (NAMES[doc_type], (GOLDEN / set_name / NAMES[doc_type]).read_bytes(), "application/xml")},
        )
        assert response.status_code == 200, response.text
    return batch["id"]


async def swapped_pair(client, headers):
    a, b = "golden_001_small_match", "golden_002_small_match"
    first = await make_batch(client, headers, {"po": a, "invoice": a, "grn": b})
    second = await make_batch(client, headers, {"po": b, "invoice": b, "grn": a})
    return first, second


async def statuses(client, headers):
    items = (await client.get("/api/v1/uploads/batches", headers=headers)).json()["items"]
    return {item["id"]: item for item in items}


@pytest.mark.asyncio
async def test_swapped_copies_are_found_and_fixed_on_confirmation(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    first, second = await swapped_pair(client, headers)
    before = await statuses(client, headers)
    assert before[first]["reconciliation_status"] == "major_diff"

    report = (await client.post(f"/api/v1/agent/batches/{first}/investigate", headers=headers)).json()
    assert report["odd_copy"]["doc_type"] == "grn"
    best = report["proposals"][0]
    assert best["kind"] == "swap"
    assert best["source_batch"]["id"] == second
    assert "tráo" in report["summary"]["conclusion"]
    assert report["ai_used"] is False

    response = await client.post(
        f"/api/v1/agent/batches/{first}/swap",
        headers=headers,
        json={"doc_type": "grn", "incoming_upload_id": best["incoming"]["id"]},
    )
    assert response.status_code == 200, response.text
    after = await statuses(client, headers)
    assert after[first]["reconciliation_status"] == "matched"
    assert after[second]["reconciliation_status"] == "matched"


@pytest.mark.asyncio
async def test_a_genuine_difference_is_not_blamed_on_a_wrong_copy(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    s = "golden_011_small_price_up_invoice"
    batch_id = await make_batch(client, headers, {"po": s, "invoice": s, "grn": s})
    report = (await client.post(f"/api/v1/agent/batches/{batch_id}/investigate", headers=headers)).json()
    assert report["odd_copy"] is None
    assert report["proposals"] == []
    assert "chênh lệch thật" in report["summary"]["conclusion"]


@pytest.mark.asyncio
async def test_swap_refuses_approved_batches_and_foreign_files(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    first, second = await swapped_pair(client, headers)
    report = (await client.post(f"/api/v1/agent/batches/{first}/investigate", headers=headers)).json()
    incoming = report["proposals"][0]["incoming"]["id"]

    # File của công ty khác: không thấy được.
    _, _, other = make_company(plan="pro")
    other_headers = await login(client, other)
    response = await client.post(
        f"/api/v1/agent/batches/{first}/swap", headers=other_headers, json={"doc_type": "grn", "incoming_upload_id": incoming}
    )
    assert response.status_code == 404

    # Bộ nguồn đã khóa (giả lập trạng thái đã duyệt).
    with SessionLocal() as db:
        use_system_context(db)
        from src.models.reconciliation import DocumentBatch

        db.get(DocumentBatch, second).status = "approved"
        db.commit()
    response = await client.post(
        f"/api/v1/agent/batches/{first}/swap", headers=headers, json={"doc_type": "grn", "incoming_upload_id": incoming}
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_ai_writes_the_conclusion_and_the_call_is_counted(client, monkeypatch):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    first, _second = await swapped_pair(client, headers)
    seen = []

    def fake_complete_json(system, user, schema, meter, *, name):
        seen.append(user)
        meter.calls += 1
        meter.prompt_tokens += 300
        meter.completion_tokens += 60
        return {"conclusion": "Hai bộ bị tráo phiếu nhập kho.", "next_step": "Đổi chỗ hai phiếu."}

    monkeypatch.setattr(agent_investigate, "is_available", lambda: True)
    monkeypatch.setattr(agent_investigate, "complete_json", fake_complete_json)
    report = (await client.post(f"/api/v1/agent/batches/{first}/investigate", headers=headers)).json()
    assert report["ai_used"] is True
    assert report["summary"]["conclusion"] == "Hai bộ bị tráo phiếu nhập kho."
    assert len(seen) == 1 and "price" not in seen[0]
    status_after = (await client.get("/api/v1/agent/status", headers=headers)).json()
    assert status_after["used"] == 1


def test_agent_needs_ai_enabled_and_quota():
    org_id, _, _ = make_company(plan="free")
    with SessionLocal() as db:
        use_system_context(db, org_id)
        organization = db.get(Organization, org_id)
        ensure_can_use_agent(db, organization)
        db.add(
            UsageCounter(
                organization_id=org_id, period=current_period(), agent_calls=PLAN_LIMITS["free"].agent_calls_per_month
            )
        )
        db.flush()
        with pytest.raises(PlanLimitError):
            ensure_can_use_agent(db, organization)
        organization.ai_enabled = False
        with pytest.raises(AgentUnavailableError):
            ensure_can_use_agent(db, organization)
        db.rollback()

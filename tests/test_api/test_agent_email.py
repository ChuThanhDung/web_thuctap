"""Trợ lý soạn thư nhà cung cấp: số liệu lấy từ đối soát, AI không được chen số, chỉ gửi khi người dùng bấm gửi."""

import pytest

from src.services import agent_email
from tests.test_api.test_agent_investigate import make_batch
from tests.test_api.test_billing_and_limits import login, make_company

PRICE_UP = "golden_011_small_price_up_invoice"


@pytest.mark.asyncio
async def test_draft_lists_the_real_differences_without_ai(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    batch_id = await make_batch(client, headers, {"po": PRICE_UP, "invoice": PRICE_UP, "grn": PRICE_UP})
    draft = (await client.post(f"/api/v1/agent/batches/{batch_id}/supplier-email", headers=headers)).json()
    assert draft["ai_used"] is False
    assert "hóa đơn số" in draft["subject"]
    assert "đơn giá trên hóa đơn" in draft["body"]
    assert accountant in draft["body"]  # chữ ký là người gửi
    assert draft["to"] is None


@pytest.mark.asyncio
async def test_matched_batches_have_nothing_to_send(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    s = "golden_001_small_match"
    batch_id = await make_batch(client, headers, {"po": s, "invoice": s, "grn": s})
    response = await client.post(f"/api/v1/agent/batches/{batch_id}/supplier-email", headers=headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_ai_wording_with_numbers_is_discarded(client, monkeypatch):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    batch_id = await make_batch(client, headers, {"po": PRICE_UP, "invoice": PRICE_UP, "grn": PRICE_UP})

    def fake_complete_json(system, user, schema, meter, *, name):
        meter.calls += 1
        return {
            "greeting": "Kính gửi anh chị phòng kinh doanh,",
            "intro": "Hóa đơn bị tính sai 999.999 đồng.",  # có số: phải bị bỏ
            "request": "Mong anh chị xuất hóa đơn điều chỉnh giúp chúng tôi.",
            "closing": "Cảm ơn anh chị.",
        }

    monkeypatch.setattr(agent_email, "is_available", lambda: True)
    monkeypatch.setattr(agent_email, "complete_json", fake_complete_json)
    draft = (await client.post(f"/api/v1/agent/batches/{batch_id}/supplier-email", headers=headers)).json()
    assert draft["ai_used"] is True
    assert "Kính gửi anh chị phòng kinh doanh," in draft["body"]
    assert "999.999" not in draft["body"]
    assert agent_email.TEMPLATE["intro"] in draft["body"]


@pytest.mark.asyncio
async def test_sending_needs_smtp_and_remembers_the_supplier_address(client, monkeypatch):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    batch_id = await make_batch(client, headers, {"po": PRICE_UP, "invoice": PRICE_UP, "grn": PRICE_UP})
    letter = {"to": "ketoan@nhacungcap.example", "subject": "Đề nghị đối chiếu", "body": "Nội dung thư đủ dài để gửi đi."}

    monkeypatch.setattr("src.api.agent.is_smtp_configured", lambda: False)
    response = await client.post(f"/api/v1/agent/batches/{batch_id}/supplier-email/send", headers=headers, json=letter)
    assert response.status_code == 503

    sent = []
    monkeypatch.setattr("src.api.agent.is_smtp_configured", lambda: True)
    monkeypatch.setattr("src.api.agent.send_supplier_letter", lambda *args, **kwargs: sent.append((args, kwargs)) or True)
    response = await client.post(f"/api/v1/agent/batches/{batch_id}/supplier-email/send", headers=headers, json=letter)
    assert response.status_code == 200, response.text
    assert sent[0][0][0] == "ketoan@nhacungcap.example"
    assert sent[0][1]["sender"] == accountant

    draft = (await client.post(f"/api/v1/agent/batches/{batch_id}/supplier-email", headers=headers)).json()
    assert draft["to"] == "ketoan@nhacungcap.example"

"""Trợ lý hỏi đáp: chỉ dùng công cụ chỉ đọc, chỉ thấy dữ liệu người hỏi được xem, tốn lượt khi gọi AI."""

import pytest

from src.database import SessionLocal, set_organization_context
from src.models.user import User
from src.services import agent_chat
from tests.test_api.test_agent_investigate import make_batch
from tests.test_api.test_billing_and_limits import login, make_company

MATCH = "golden_001_small_match"
PRICE_UP = "golden_011_small_price_up_invoice"


def company_data(email: str) -> agent_chat.CompanyData:
    db = SessionLocal()
    from sqlalchemy import select

    from src.database import use_system_context

    use_system_context(db)
    user = db.scalar(select(User).where(User.email == email))
    set_organization_context(db, user.organization_id)
    return agent_chat.CompanyData(db, user)


@pytest.mark.asyncio
async def test_tools_only_see_the_askers_own_company(client):
    _, _, accountant_a = make_company(plan="pro")
    _, _, accountant_b = make_company(plan="pro")
    await make_batch(client, await login(client, accountant_a), {"po": PRICE_UP, "invoice": PRICE_UP, "grn": PRICE_UP})
    await make_batch(client, await login(client, accountant_b), {"po": MATCH, "invoice": MATCH, "grn": MATCH})

    data_a = company_data(accountant_a)
    try:
        listed = data_a.list_batches({})
        assert listed["total"] == 1
        assert listed["items"][0]["result_text"] == "lệch lớn"
        assert data_a.list_batches({"result": "matched"})["total"] == 0
        stats = data_a.supplier_stats({})
        assert len(stats["suppliers"]) == 1 and stats["suppliers"][0]["major_diff"] == 1
        assert data_a.approval_queue({})["total"] == 0
        other_number = company_data(accountant_b).rows[0]["batch_number"]
        own_number = listed["items"][0]["batch_number"]
        if other_number != own_number:
            assert "error" in data_a.batch_detail({"batch_number": other_number})
        detail = data_a.batch_detail({"batch_number": own_number})
        assert detail["differences"]
    finally:
        data_a.db.close()


@pytest.mark.asyncio
async def test_chat_answers_through_tools_and_counts_the_call(client, monkeypatch):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    await make_batch(client, headers, {"po": PRICE_UP, "invoice": PRICE_UP, "grn": PRICE_UP})

    def fake_chat(system, messages, tools, meter, *, max_steps):
        assert set(tools) == {"list_batches", "batch_detail", "supplier_stats", "approval_queue", "usage_this_month"}
        meter.calls += 2
        rows = tools["list_batches"][1]({"result": "major_diff"})
        return f"Có {rows['total']} bộ lệch lớn: {rows['items'][0]['batch_number']}."

    monkeypatch.setattr("src.api.agent.is_available", lambda: True)
    monkeypatch.setattr(agent_chat, "chat_with_tools", fake_chat)
    response = await client.post(
        "/api/v1/agent/chat", headers=headers, json={"messages": [{"role": "user", "content": "Bộ nào lệch lớn?"}]}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"].startswith("Có 1 bộ lệch lớn")
    assert len(body["batches"]) == 1
    status_after = (await client.get("/api/v1/agent/status", headers=headers)).json()
    assert status_after["used"] == 2


@pytest.mark.asyncio
async def test_chat_without_ai_says_so(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    response = await client.post(
        "/api/v1/agent/chat", headers=headers, json={"messages": [{"role": "user", "content": "Xin chào"}]}
    )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_platform_admin_cannot_use_the_assistant(client):
    response = await client.post("/api/v1/agent/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 401

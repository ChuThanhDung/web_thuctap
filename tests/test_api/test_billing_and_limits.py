"""Hạn mức theo gói (402 khi vượt) và thanh toán qua webhook SePay.

Mỗi test tạo công ty riêng và đăng nhập thật, để RLS và hạn mức áp đúng như production.
"""

import dataclasses
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from src.config import get_settings
from src.database import SessionLocal, set_organization_context, use_system_context
from src.models.billing import Payment
from src.models.organization import Organization
from src.models.role import Role
from src.models.user import User
from src.services.auth import hash_password, next_public_user_id
from src.services.organizations import ensure_default_thresholds
from src.services.plans import PLAN_LIMITS, record_usage

PASSWORD = "Billing-test-2026"
WEBHOOK_KEY = "test-sepay-key-0123456789"
XML_SET = Path(__file__).resolve().parents[2] / "dataset" / "xml" / "batch_01_match"


def make_company(plan="free", trial_days=None, plan_expires_at=None):
    """Tạo công ty với một kế toán trưởng và một kế toán viên. Trả về (id công ty, email KTT, email KTV)."""
    org_id = uuid.uuid4()
    suffix = org_id.hex[:10]
    with SessionLocal() as db:
        use_system_context(db, org_id)
        db.add(
            Organization(
                id=org_id,
                name=f"Công ty hạn mức {suffix}",
                plan=plan,
                trial_ends_at=datetime.now(UTC) + timedelta(days=trial_days) if trial_days else None,
                plan_expires_at=plan_expires_at,
            )
        )
        db.flush()
        ensure_default_thresholds(db, org_id)
        roles = {role.code: role for role in db.scalars(select(Role)).all()}
        emails = []
        for role in ("chief_accountant", "accountant"):
            email = f"{role}-{suffix}@example.com"
            emails.append(email)
            db.add(
                User(
                    organization_id=org_id,
                    public_id=next_public_user_id(db),
                    email=email,
                    password_hash=hash_password(PASSWORD),
                    full_name=f"Người dùng {role}",
                    role_id=roles[role].id,
                    status="ACTIVE",
                )
            )
        db.commit()
    return org_id, emails[0], emails[1]


def set_usage(org_id, *, batches=0, ai_files=0):
    with SessionLocal() as db:
        set_organization_context(db, org_id)
        record_usage(db, org_id, batches=batches, ai_files=ai_files)
        db.commit()


async def login(client, email):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def upload(client, headers, batch_id, name, doc_type, content=None, content_type="application/xml"):
    return await client.post(
        "/api/v1/uploads",
        headers=headers,
        data={"doc_type": doc_type, "batch_id": str(batch_id)},
        files={"file": (name, content if content is not None else (XML_SET / name).read_bytes(), content_type)},
    )


@pytest.fixture
def billing_enabled(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "sepay_bank_code", "MBBank")
    monkeypatch.setattr(settings, "sepay_bank_account", "0123456789")
    monkeypatch.setattr(settings, "sepay_account_name", "DOCUSYNC TEST")
    monkeypatch.setattr(settings, "sepay_webhook_api_key", WEBHOOK_KEY)
    sent = []
    monkeypatch.setattr("src.services.billing.send_payment_confirmed_email", lambda *args: sent.append(args) or True)
    return sent


# --- Hạn mức ------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_free_plan_stops_new_batches_at_the_monthly_limit_and_deleting_does_not_refund(client):
    org_id, _, accountant = make_company()
    headers = await login(client, accountant)
    set_usage(org_id, batches=PLAN_LIMITS["free"].batches_per_month - 1)

    last = await client.post("/api/v1/uploads/batches", headers=headers)
    assert last.status_code == 200
    blocked = await client.post("/api/v1/uploads/batches", headers=headers)
    assert blocked.status_code == 402
    assert blocked.json()["code"] == "plan_limit"
    assert blocked.json()["resource"] == "batches"
    assert "15 bộ" in blocked.json()["detail"]

    # Xóa bộ không trả lại lượt: tạo lại vẫn bị chặn.
    assert (await client.delete(f"/api/v1/uploads/batches/{last.json()['id']}", headers=headers)).status_code == 200
    assert (await client.post("/api/v1/uploads/batches", headers=headers)).status_code == 402

    usage = (await client.get("/api/v1/billing/overview", headers=headers)).json()["usage"]
    assert usage["batches"] == PLAN_LIMITS["free"].batches_per_month


@pytest.mark.asyncio
async def test_ai_reads_are_limited_but_xml_still_uploads(client, monkeypatch):
    calls = []
    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", lambda *args: calls.append(args))
    org_id, _, accountant = make_company()
    headers = await login(client, accountant)
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    set_usage(org_id, ai_files=PLAN_LIMITS["free"].ai_files_per_month)

    pdf = await upload(client, headers, batch["id"], "po.pdf", "po", b"%PDF-1.4 test", "application/pdf")
    assert pdf.status_code == 402
    assert pdf.json()["resource"] == "ai_files"
    assert calls == []  # chặn trước khi gọi AI, không tốn tiền

    monkeypatch.undo()
    xml = await upload(client, headers, batch["id"], "01_purchase_order.xml", "po")
    assert xml.status_code == 200, xml.text
    usage = (await client.get("/api/v1/billing/overview", headers=headers)).json()["usage"]
    assert usage["ai_files"] == PLAN_LIMITS["free"].ai_files_per_month
    assert usage["storage_bytes"] == len((XML_SET / "01_purchase_order.xml").read_bytes())


@pytest.mark.asyncio
async def test_storage_limit_blocks_uploads_that_would_overflow(client, monkeypatch):
    monkeypatch.setitem(PLAN_LIMITS, "free", dataclasses.replace(PLAN_LIMITS["free"], storage_bytes=1000))
    _, _, accountant = make_company()
    headers = await login(client, accountant)
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    response = await upload(client, headers, batch["id"], "01_purchase_order.xml", "po")
    assert response.status_code == 402
    assert response.json()["resource"] == "storage"


@pytest.mark.asyncio
async def test_free_plan_has_two_seats_counting_pending_invitations(client, monkeypatch):
    monkeypatch.setattr("src.services.signup.send_invitation_email", lambda *args: True)
    _, chief_email, accountant_email = make_company()
    chief = await login(client, chief_email)
    # Đã có 2 người (KTT + KTV): mời thêm hay tạo thêm đều bị chặn.
    invite = await client.post(
        "/api/v1/auth/invitations",
        headers=chief,
        json={"email": f"x-{uuid.uuid4().hex[:8]}@example.com", "full_name": "Người Mới"},
    )
    assert invite.status_code == 402
    assert invite.json()["resource"] == "users"

    # Ngưng kế toán viên thì có chỗ để mời người khác; bật lại người cũ thì hết chỗ.
    users = (await client.get("/api/v1/auth/users", headers=chief)).json()["items"]
    accountant_id = next(u["id"] for u in users if u["email"] == accountant_email)
    assert (await client.delete(f"/api/v1/auth/users/{accountant_id}", headers=chief)).status_code == 200
    invite = await client.post(
        "/api/v1/auth/invitations",
        headers=chief,
        json={"email": f"y-{uuid.uuid4().hex[:8]}@example.com", "full_name": "Người Mới"},
    )
    assert invite.status_code == 201, invite.text
    assert (await client.patch(f"/api/v1/auth/users/{accountant_id}/activate", headers=chief)).status_code == 402


@pytest.mark.asyncio
async def test_trial_company_gets_pro_limits_and_expired_paid_plan_falls_back_to_free(client):
    org_id, _, accountant = make_company(trial_days=10)
    headers = await login(client, accountant)
    set_usage(org_id, batches=PLAN_LIMITS["free"].batches_per_month + 5)
    assert (await client.post("/api/v1/uploads/batches", headers=headers)).status_code == 200
    overview = (await client.get("/api/v1/billing/overview", headers=headers)).json()
    assert overview["limits"]["code"] == "pro"
    assert [plan["code"] for plan in overview["plans"]] == ["free", "pro", "ultra"]

    _, _, expired_accountant = make_company(plan="ultra", plan_expires_at=datetime.now(UTC) - timedelta(days=1))
    expired = await login(client, expired_accountant)
    overview = (await client.get("/api/v1/billing/overview", headers=expired)).json()
    assert overview["organization"]["plan"] == "ultra"
    assert overview["organization"]["effective_plan"] == "free"
    assert overview["limits"]["code"] == "free"


# --- Thanh toán ---------------------------------------------------------------------------------------------------


def webhook_payload(code, amount, transaction_id=None):
    return {
        "id": transaction_id or int(uuid.uuid4().int % 10**9),
        "gateway": "MBBank",
        "transactionDate": "2026-11-04 10:00:00",
        "accountNumber": "0123456789",
        "code": None,
        "content": f"CT DEN:0123 {code} thanh toan DocuSync",
        "transferType": "in",
        "transferAmount": amount,
        "accumulated": 0,
        "subAccount": None,
        "referenceCode": "FT26308ABC",
        "description": "",
    }


async def send_webhook(client, payload, key=WEBHOOK_KEY):
    return await client.post("/api/v1/billing/webhook", headers={"Authorization": f"Apikey {key}"}, json=payload)


@pytest.mark.asyncio
async def test_checkout_is_off_until_sepay_is_configured(client):
    _, chief_email, _ = make_company()
    chief = await login(client, chief_email)
    response = await client.post("/api/v1/billing/checkout", headers=chief, json={"plan": "pro", "months": 1})
    assert response.status_code == 503
    assert (await client.get("/api/v1/billing/overview", headers=chief)).json()["billing_enabled"] is False


@pytest.mark.asyncio
async def test_bank_transfer_activates_the_plan_once(client, billing_enabled):
    org_id, chief_email, accountant_email = make_company()
    chief = await login(client, chief_email)

    accountant = await login(client, accountant_email)
    assert (
        await client.post("/api/v1/billing/checkout", headers=accountant, json={"plan": "pro", "months": 1})
    ).status_code == 403

    created = await client.post("/api/v1/billing/checkout", headers=chief, json={"plan": "pro", "months": 12})
    assert created.status_code == 201, created.text
    payment = created.json()
    assert payment["amount"] == PLAN_LIMITS["pro"].monthly_price * 10  # trả 12 tháng tính 10
    assert payment["transfer"]["content"] == payment["code"]
    assert payment["code"] in payment["transfer"]["qr_url"]
    assert f"amount={payment['amount']}" in payment["transfer"]["qr_url"]
    # Bấm lại thì dùng lại đơn đang chờ, không sinh mã mới.
    again = (await client.post("/api/v1/billing/checkout", headers=chief, json={"plan": "pro", "months": 12})).json()
    assert again["code"] == payment["code"]

    assert (
        await send_webhook(client, webhook_payload(payment["code"], payment["amount"]), key="sai")
    ).status_code == 401

    underpaid = await send_webhook(client, webhook_payload(payment["code"], payment["amount"] - 1000))
    assert underpaid.json()["result"] == "underpaid"

    payload = webhook_payload(payment["code"], payment["amount"])
    paid = await send_webhook(client, payload)
    assert paid.status_code == 200
    assert paid.json()["result"] == "paid"
    assert len(billing_enabled) == 1  # email xác nhận gửi kế toán trưởng
    # SePay gửi lại cùng giao dịch: không cộng thêm thời gian.
    assert (await send_webhook(client, payload)).json()["result"] == "duplicate"

    status = (await client.get(f"/api/v1/billing/payments/{payment['id']}", headers=chief)).json()
    assert status["status"] == "paid"
    assert status["transfer"] is None
    overview = (await client.get("/api/v1/billing/overview", headers=chief)).json()
    assert overview["organization"]["plan"] == "pro"
    expires = datetime.fromisoformat(overview["organization"]["plan_expires_at"])
    assert timedelta(days=359) < expires - datetime.now(UTC) <= timedelta(days=360)

    history = (await client.get("/api/v1/billing/payments", headers=chief)).json()
    assert [item["status"] for item in history] == ["paid"]


@pytest.mark.asyncio
async def test_renewing_the_same_plan_extends_from_the_current_expiry(client, billing_enabled):
    current_end = datetime.now(UTC) + timedelta(days=10)
    _, chief_email, _ = make_company(plan="pro", plan_expires_at=current_end)
    chief = await login(client, chief_email)
    payment = (await client.post("/api/v1/billing/checkout", headers=chief, json={"plan": "pro", "months": 1})).json()
    assert (await send_webhook(client, webhook_payload(payment["code"], payment["amount"]))).json()["result"] == "paid"
    org = (await client.get("/api/v1/auth/me", headers=chief)).json()["organization"]
    assert abs(datetime.fromisoformat(org["plan_expires_at"]) - (current_end + timedelta(days=30))) < timedelta(
        seconds=5
    )


@pytest.mark.asyncio
async def test_webhook_ignores_unrelated_transfers_and_payments_stay_private(client, billing_enabled):
    assert (await send_webhook(client, webhook_payload("chuyen tien an trua", 50_000))).json()[
        "result"
    ] == "ignored_no_code"
    outgoing = {**webhook_payload("DSA22222222", 1), "transferType": "out"}
    assert (await send_webhook(client, outgoing)).json()["result"] == "ignored_outgoing"
    assert (await send_webhook(client, webhook_payload("DSA22222222", 1))).json()["result"] == "unknown_code"

    _, chief_a, _ = make_company()
    _, chief_b, _ = make_company()
    a = await login(client, chief_a)
    b = await login(client, chief_b)
    payment = (await client.post("/api/v1/billing/checkout", headers=a, json={"plan": "ultra", "months": 1})).json()
    assert (await client.get(f"/api/v1/billing/payments/{payment['id']}", headers=b)).status_code == 404
    assert (await client.get("/api/v1/billing/payments", headers=b)).json() == []


@pytest.mark.asyncio
async def test_admin_revenue_and_manual_plan_with_expiry(client, billing_enabled):
    from tests.test_api.test_signup_and_admin import ADMIN_EMAIL
    from tests.test_api.test_signup_and_admin import PASSWORD as ADMIN_PASSWORD

    with SessionLocal() as db:
        use_system_context(db)
        if db.scalars(select(User).where(User.email == ADMIN_EMAIL)).first() is None:
            role = db.scalars(select(Role).where(Role.code == "platform_admin")).one()
            db.add(
                User(
                    organization_id=None,
                    public_id=next_public_user_id(db),
                    email=ADMIN_EMAIL,
                    password_hash=hash_password(ADMIN_PASSWORD),
                    full_name="Admin",
                    role_id=role.id,
                    status="ACTIVE",
                )
            )
            db.commit()
    admin_login = await client.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    admin = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    before = (await client.get("/api/v1/admin/overview", headers=admin)).json()["revenue_this_month"]
    org_id, chief_email, _ = make_company()
    chief = await login(client, chief_email)
    payment = (await client.post("/api/v1/billing/checkout", headers=chief, json={"plan": "pro", "months": 1})).json()
    await send_webhook(client, webhook_payload(payment["code"], payment["amount"]))
    after = (await client.get("/api/v1/admin/overview", headers=admin)).json()["revenue_this_month"]
    assert after - before == payment["amount"]

    granted = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", headers=admin, json={"plan": "ultra", "plan_days": 30}
    )
    assert granted.json()["effective_plan"] == "ultra"
    assert datetime.fromisoformat(granted.json()["plan_expires_at"]) > datetime.now(UTC) + timedelta(days=29)
    forever = await client.patch(f"/api/v1/admin/organizations/{org_id}", headers=admin, json={"plan": "pro"})
    assert forever.json()["plan_expires_at"] is None

    with SessionLocal() as db:
        use_system_context(db)
        assert db.scalars(select(Payment).where(Payment.code == payment["code"])).one().status == "paid"


@pytest.mark.asyncio
async def test_plans_are_public_for_the_pricing_page(client):
    response = await client.get("/api/v1/billing/plans")
    assert response.status_code == 200
    plans = {plan["code"]: plan for plan in response.json()}
    assert list(plans) == ["free", "pro", "ultra"]
    assert plans["pro"]["monthly_price"] == PLAN_LIMITS["pro"].monthly_price
    assert plans["pro"]["yearly_price"] == PLAN_LIMITS["pro"].monthly_price * 10
    assert plans["ultra"]["users"] is None

"""Tự đăng ký công ty, lời mời người dùng, và trang quản trị nền tảng.

Dùng đăng nhập thật (không thay get_current_user) để đi đúng đường RLS. Email gửi đi được chặn lại để đọc OTP và link
mời, không gửi thật.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from src.config import get_settings
from src.database import SessionLocal, use_system_context
from src.models.organization import DEMO_ORGANIZATION_ID, Organization
from src.models.role import Role
from src.models.signup import SignupRequest
from src.models.user import User
from src.services.auth import hash_password, next_public_user_id

PASSWORD = "Signup-test-2026"
ADMIN_EMAIL = "platform.admin@example.com"


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def outbox(monkeypatch):
    """Thu email OTP và lời mời thay vì gửi thật."""
    sent: dict[str, list] = {"otp": [], "invite": [], "welcome": []}

    def fake_otp(to_email, company_name, otp):
        sent["otp"].append((to_email, otp))
        return True

    def fake_invite(to_email, recipient_name, company_name, inviter_name, role_name, accept_url, days):
        sent["invite"].append((to_email, accept_url))
        return True

    monkeypatch.setattr("src.services.signup.send_signup_otp_email", fake_otp)
    monkeypatch.setattr("src.services.signup.send_invitation_email", fake_invite)
    monkeypatch.setattr("src.api.signup.send_welcome_email", lambda *args: sent["welcome"].append(args) or True)
    return sent


@pytest.fixture(autouse=True)
def generous_signup_limits(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "signup_max_per_ip_per_hour", 1000)
    monkeypatch.setattr(settings, "signup_max_per_email_per_hour", 1000)
    monkeypatch.setattr(settings, "signup_enabled", True)


@pytest.fixture(scope="module")
def platform_admin():
    with SessionLocal() as db:
        use_system_context(db)
        user = db.scalars(select(User).where(User.email == ADMIN_EMAIL)).first()
        if user is None:
            role = db.scalars(select(Role).where(Role.code == "platform_admin")).one()
            db.add(
                User(
                    organization_id=None,
                    public_id=next_public_user_id(db),
                    email=ADMIN_EMAIL,
                    password_hash=hash_password(PASSWORD),
                    full_name="Admin nền tảng",
                    role_id=role.id,
                    status="ACTIVE",
                )
            )
            db.commit()
    return ADMIN_EMAIL


async def login(client, email, password):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest_asyncio.fixture
async def admin_headers(client, platform_admin):
    return await login(client, platform_admin, PASSWORD)


async def sign_up(client, outbox, email=None, company="Công ty Đăng ký Thử"):
    email = email or unique_email("chief")
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "company_name": company,
            "tax_id": "0312345678",
            "full_name": "Phạm Thu Hà",
            "email": email,
            "password": PASSWORD,
            "accept_terms": True,
        },
    )
    assert response.status_code == 201, response.text
    signup_id = response.json()["signup_id"]
    otp = next(code for to, code in reversed(outbox["otp"]) if to == email)
    return email, signup_id, otp


# --- Đăng ký ------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_signup_with_otp_creates_company_on_pro_trial_and_logs_in(client, outbox):
    email, signup_id, otp = await sign_up(client, outbox)
    response = await client.post("/api/v1/auth/signup/verify", json={"signup_id": signup_id, "otp": otp})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["email"] == email
    assert body["user"]["role"] == "chief_accountant"
    organization = body["user"]["organization"]
    assert organization["name"] == "Công ty Đăng ký Thử"
    assert organization["plan"] == "free"
    assert organization["effective_plan"] == "pro"
    trial_end = datetime.fromisoformat(organization["trial_ends_at"])
    assert [args[0] for args in outbox["welcome"]] == [email]
    assert timedelta(days=13) < trial_end - datetime.now(UTC) <= timedelta(days=14)

    headers = {"Authorization": f"Bearer {body['access_token']}"}
    # Công ty mới trống, có ngưỡng mặc định riêng, và chỉ thấy chính mình trong danh sách người dùng.
    assert (await client.get("/api/v1/uploads/batches", headers=headers)).json()["items"] == []
    assert len((await client.get("/api/v1/thresholds", headers=headers)).json()) == 2
    users = (await client.get("/api/v1/auth/users", headers=headers)).json()["items"]
    assert [user["email"] for user in users] == [email]

    # Mật khẩu đã đặt lúc đăng ký dùng được để đăng nhập lại.
    await login(client, email, PASSWORD)


@pytest.mark.asyncio
async def test_signup_rejects_wrong_otp_then_locks_after_max_attempts(client, outbox):
    _, signup_id, otp = await sign_up(client, outbox)
    wrong = "000000" if otp != "000000" else "111111"
    max_attempts = get_settings().password_otp_max_attempts
    for _ in range(max_attempts):
        response = await client.post("/api/v1/auth/signup/verify", json={"signup_id": signup_id, "otp": wrong})
        assert response.status_code == 400
    # Đã khóa: kể cả mã đúng cũng không dùng được nữa, phải gửi lại mã.
    response = await client.post("/api/v1/auth/signup/verify", json={"signup_id": signup_id, "otp": otp})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_signup_refuses_email_used_in_another_company(client, outbox):
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "company_name": "Công ty trùng email",
            "full_name": "Ai Đó",
            "email": "chief.accountant@docusync.ai",
            "password": PASSWORD,
            "accept_terms": True,
        },
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_signup_requires_terms_and_strong_password(client, outbox):
    base = {"company_name": "Công ty A", "full_name": "Ai Đó", "email": unique_email("terms"), "password": PASSWORD}
    assert (await client.post("/api/v1/auth/signup", json={**base, "accept_terms": False})).status_code == 422
    weak = {**base, "password": "12345678", "accept_terms": True}
    assert (await client.post("/api/v1/auth/signup", json=weak)).status_code == 422


@pytest.mark.asyncio
async def test_signup_is_rate_limited_per_email(client, outbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "signup_max_per_email_per_hour", 2)
    email = unique_email("spam")
    await sign_up(client, outbox, email=email)
    await sign_up(client, outbox, email=email)
    response = await client.post(
        "/api/v1/auth/signup",
        json={"company_name": "Spam", "full_name": "Spam", "email": email, "password": PASSWORD, "accept_terms": True},
    )
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_signup_resend_waits_before_sending_again(client, outbox):
    _, signup_id, _ = await sign_up(client, outbox)
    response = await client.post("/api/v1/auth/signup/resend", json={"signup_id": signup_id})
    assert response.status_code == 429
    assert "Retry-After" in response.headers

    with SessionLocal() as db:
        request = db.get(SignupRequest, uuid.UUID(signup_id))
        request.otp_sent_at = datetime.now(UTC) - timedelta(minutes=5)
        db.commit()
    before = len(outbox["otp"])
    assert (await client.post("/api/v1/auth/signup/resend", json={"signup_id": signup_id})).status_code == 200
    assert len(outbox["otp"]) == before + 1


@pytest.mark.asyncio
async def test_signup_can_be_turned_off(client, outbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "signup_enabled", False)
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "company_name": "Tắt",
            "full_name": "Tắt",
            "email": unique_email("off"),
            "password": PASSWORD,
            "accept_terms": True,
        },
    )
    assert response.status_code == 403


# --- Lời mời ------------------------------------------------------------------------------------------------------


async def new_company(client, outbox):
    _, signup_id, otp = await sign_up(client, outbox)
    body = (await client.post("/api/v1/auth/signup/verify", json={"signup_id": signup_id, "otp": otp})).json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["organization"]["id"]


@pytest.mark.asyncio
async def test_invited_accountant_joins_the_inviting_company_only(client, outbox):
    chief, org_id = await new_company(client, outbox)
    email = unique_email("invitee")
    response = await client.post(
        "/api/v1/auth/invitations",
        headers=chief,
        json={"email": email, "full_name": "Lê Văn Nam", "role_code": "accountant"},
    )
    assert response.status_code == 201, response.text
    accept_url = response.json()["accept_url"]
    assert response.json()["email_sent"] is True
    assert accept_url == next(url for to, url in outbox["invite"] if to == email)
    token = accept_url.split("token=")[1]

    pending = (await client.get("/api/v1/auth/invitations", headers=chief)).json()
    assert [item["email"] for item in pending] == [email]

    lookup = await client.get("/api/v1/auth/invitations/lookup", params={"token": token})
    assert lookup.status_code == 200
    assert lookup.json()["organization_name"] == "Công ty Đăng ký Thử"

    accepted = await client.post("/api/v1/auth/invitations/accept", json={"token": token, "password": PASSWORD, "accept_terms": True})
    assert accepted.status_code == 200, accepted.text
    user = accepted.json()["user"]
    assert user["role"] == "accountant"
    assert user["organization"]["id"] == org_id

    # Link chỉ dùng được một lần; lời mời không còn trong danh sách chờ.
    again = await client.post("/api/v1/auth/invitations/accept", json={"token": token, "password": PASSWORD, "accept_terms": True})
    assert again.status_code == 404
    assert (await client.get("/api/v1/auth/invitations", headers=chief)).json() == []

    # Kế toán viên mới chỉ thấy công ty của mình, không thấy bộ của công ty Demo.
    invitee = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    assert (await client.get("/api/v1/uploads/batches", headers=invitee)).json()["items"] == []
    chief_users = {u["email"] for u in (await client.get("/api/v1/auth/users", headers=chief)).json()["items"]}
    assert email in chief_users
    assert "accountant@docusync.ai" not in chief_users


@pytest.mark.asyncio
async def test_revoked_invitation_cannot_be_used_and_is_private_to_the_company(client, outbox):
    chief, _ = await new_company(client, outbox)
    email = unique_email("revoked")
    created = (
        await client.post("/api/v1/auth/invitations", headers=chief, json={"email": email, "full_name": "Hủy Mời"})
    ).json()
    token = created["accept_url"].split("token=")[1]

    # Kế toán trưởng công ty khác không thấy và không hủy được lời mời này.
    demo_chief = await login(client, "chief.accountant@docusync.ai", "123456")
    assert email not in {i["email"] for i in (await client.get("/api/v1/auth/invitations", headers=demo_chief)).json()}
    assert (await client.delete(f"/api/v1/auth/invitations/{created['id']}", headers=demo_chief)).status_code == 404

    assert (await client.delete(f"/api/v1/auth/invitations/{created['id']}", headers=chief)).status_code == 200
    response = await client.post("/api/v1/auth/invitations/accept", json={"token": token, "password": PASSWORD, "accept_terms": True})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_only_chief_accountant_invites_and_existing_emails_are_refused(client, outbox):
    accountant = await login(client, "accountant@docusync.ai", "123456")
    body = {"email": unique_email("x"), "full_name": "Không Được"}
    assert (await client.post("/api/v1/auth/invitations", headers=accountant, json=body)).status_code == 403

    chief, _ = await new_company(client, outbox)
    taken = {"email": "accountant@docusync.ai", "full_name": "Trùng Email"}
    assert (await client.post("/api/v1/auth/invitations", headers=chief, json=taken)).status_code == 409


@pytest.mark.asyncio
async def test_chief_cannot_create_user_with_email_of_another_company(client, outbox):
    chief, _ = await new_company(client, outbox)
    response = await client.post(
        "/api/v1/auth/users",
        headers=chief,
        json={
            "email": "accountant@docusync.ai",
            "password": PASSWORD,
            "full_name": "Trùng Email",
            "role_code": "accountant",
            "phone": "0901234567",
            "citizen_id": "001234567890",
            "address": "Hà Nội",
        },
    )
    assert response.status_code == 400


# --- Admin nền tảng -----------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_platform_admin_sees_companies_and_usage_but_no_documents(client, outbox, admin_headers):
    _, org_id = await new_company(client, outbox)

    overview = await client.get("/api/v1/admin/overview", headers=admin_headers)
    assert overview.status_code == 200
    assert overview.json()["organizations"] >= 2
    assert overview.json()["in_trial"] >= 1

    listed = (await client.get("/api/v1/admin/organizations", headers=admin_headers)).json()["items"]
    ids = {row["id"] for row in listed}
    assert {org_id, str(DEMO_ORGANIZATION_ID)} <= ids

    detail = (await client.get(f"/api/v1/admin/organizations/{org_id}", headers=admin_headers)).json()
    assert detail["user_count"] == 1
    assert detail["users"][0]["role"] == "chief_accountant"

    found = (
        await client.get("/api/v1/admin/organizations", headers=admin_headers, params={"search": "Đăng ký"})
    ).json()
    assert org_id in {row["id"] for row in found["items"]}

    # Không gọi được API nghiệp vụ: không xem bộ chứng từ, người dùng hay ngưỡng của công ty nào.
    for path in ("/api/v1/uploads/batches", "/api/v1/auth/users", "/api/v1/thresholds", "/api/v1/audit-logs"):
        assert (await client.get(path, headers=admin_headers)).status_code == 403, path
    assert (await client.get("/api/v1/notifications", headers=admin_headers)).status_code == 200
    me = (await client.get("/api/v1/auth/me", headers=admin_headers)).json()
    assert me["role"] == "platform_admin"
    assert me["organization"] is None


@pytest.mark.asyncio
async def test_company_users_cannot_open_the_admin_console(client):
    for email in ("accountant@docusync.ai", "chief.accountant@docusync.ai"):
        headers = await login(client, email, "123456")
        assert (await client.get("/api/v1/admin/organizations", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_suspending_a_company_blocks_its_users_until_reactivated(client, outbox, admin_headers):
    chief, org_id = await new_company(client, outbox)
    assert (await client.get("/api/v1/auth/me", headers=chief)).status_code == 200

    response = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", headers=admin_headers, json={"status": "suspended"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "suspended"
    # Phiên đang mở bị chặn ngay, và không đăng nhập lại được.
    assert (await client.get("/api/v1/auth/me", headers=chief)).status_code == 403

    response = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", headers=admin_headers, json={"status": "active"}
    )
    assert response.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=chief)).status_code == 200


@pytest.mark.asyncio
async def test_admin_changes_plan_and_ends_trial(client, outbox, admin_headers):
    chief, org_id = await new_company(client, outbox)
    ended = await client.patch(f"/api/v1/admin/organizations/{org_id}", headers=admin_headers, json={"trial_days": 0})
    assert ended.json()["effective_plan"] == "free"
    assert (await client.get("/api/v1/auth/me", headers=chief)).json()["organization"]["effective_plan"] == "free"

    upgraded = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", headers=admin_headers, json={"plan": "ultra"}
    )
    assert upgraded.json()["plan"] == "ultra"
    assert upgraded.json()["effective_plan"] == "ultra"
    assert (
        await client.patch(f"/api/v1/admin/organizations/{org_id}", headers=admin_headers, json={"plan": "gold"})
    ).status_code == 422


def test_trial_never_downgrades_a_paid_plan():
    from src.services.organizations import effective_plan

    organization = Organization(name="x", plan="ultra", trial_ends_at=datetime.now(UTC) + timedelta(days=3))
    assert effective_plan(organization) == "ultra"
    organization.plan = "free"
    assert effective_plan(organization) == "pro"
    organization.trial_ends_at = datetime.now(UTC) - timedelta(seconds=1)
    assert effective_plan(organization) == "free"


@pytest.mark.asyncio
async def test_platform_admin_can_accept_new_terms(client, admin_headers):
    headers = admin_headers
    assert (await client.post("/api/v1/auth/terms/accept", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_platform_admin_can_set_up_mfa_when_enforced(client, platform_admin, monkeypatch):
    from src.config import get_settings

    monkeypatch.setattr(get_settings(), "mfa_enforced", True)
    headers = await login(client, platform_admin, PASSWORD)
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()
    assert me["mfa_setup_required"] is True
    assert (await client.post("/api/v1/auth/terms/accept", headers=headers)).status_code == 200
    setup = await client.post("/api/v1/auth/mfa/setup", headers=headers)
    assert setup.status_code == 200, setup.text


@pytest.mark.asyncio
async def test_invitation_says_honestly_when_the_email_did_not_go_out(client, outbox, monkeypatch):
    chief, _org_id = await new_company(client, outbox)
    monkeypatch.setattr("src.services.signup.send_invitation_email", lambda *args, **kwargs: False)
    response = await client.post(
        "/api/v1/auth/invitations",
        headers=chief,
        json={"email": unique_email("noemail"), "full_name": "Trần Thu", "role_code": "accountant"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["email_sent"] is False
    assert "token=" in response.json()["accept_url"]

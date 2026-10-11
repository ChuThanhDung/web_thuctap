import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete

from src.models.audit_log import AuditLog
from src.models.user import User
from src.models.user_session import UserSession

pytestmark = pytest.mark.asyncio


async def login(client, email):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": "123456"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest_asyncio.fixture
async def chief(client):
    return await login(client, "chief.accountant@docusync.ai")


@pytest_asyncio.fixture
async def accountant(client):
    return await login(client, "accountant@docusync.ai")


@pytest.fixture
def new_user_payload():
    unique = uuid.uuid4().int
    return {
        "email": f"qa-{uuid.uuid4().hex[:8]}@example.com",
        "password": "Str0ng-Pass1",
        "full_name": "QA Tester",
        "role_code": "accountant",
        "phone": str(unique)[:10].rjust(10, "9"),
        "citizen_id": str(unique)[:12].rjust(12, "9"),
        "address": "1 Test Street",
    }


@pytest.fixture
def cleanup_created_users(db_session):
    yield
    db_session.rollback()
    users = db_session.query(User).filter(User.email.like("qa-%@example.com")).all()
    ids = [str(user.id) for user in users]
    if ids:
        db_session.execute(delete(AuditLog).where(AuditLog.target_id.in_(ids)))
        db_session.execute(delete(AuditLog).where(AuditLog.user_id.in_([user.id for user in users])))
        db_session.execute(delete(UserSession).where(UserSession.user_id.in_([user.id for user in users])))
    db_session.execute(delete(AuditLog).where(AuditLog.details["email"].astext.like("qa-%@example.com")))
    for user in users:
        db_session.delete(user)
    db_session.commit()


async def test_accountant_cannot_create_or_list_users(client, accountant, new_user_payload):
    assert (await client.post("/api/v1/auth/users", json=new_user_payload, headers=accountant)).status_code == 403
    assert (await client.get("/api/v1/auth/users", headers=accountant)).status_code == 403


async def test_user_endpoints_require_authentication(client):
    assert (await client.get("/api/v1/auth/users")).status_code == 401
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await client.get("/api/v1/audit-logs")).status_code == 401
    assert (await client.get("/api/v1/thresholds")).status_code == 401


@pytest.mark.parametrize("weak_password", ["123456", "abcdefgh", "12345678", "Ab1", "password1"])
async def test_create_user_rejects_weak_passwords(client, chief, new_user_payload, weak_password):
    new_user_payload["password"] = weak_password
    response = await client.post("/api/v1/auth/users", json=new_user_payload, headers=chief)
    assert response.status_code == 422


async def test_chief_manages_user_lifecycle(client, chief, new_user_payload, cleanup_created_users):
    created = await client.post("/api/v1/auth/users", json=new_user_payload, headers=chief)
    assert created.status_code == 201
    user_id = created.json()["id"]
    assert created.json()["role"] == "accountant"

    listing = await client.get("/api/v1/auth/users", headers=chief)
    assert any(item["id"] == user_id for item in listing.json()["items"])

    updated = await client.patch(f"/api/v1/auth/users/{user_id}", json={"full_name": "QA Renamed"}, headers=chief)
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "QA Renamed"

    deactivated = await client.delete(f"/api/v1/auth/users/{user_id}", headers=chief)
    assert deactivated.status_code == 200
    assert deactivated.json()["status"] == "DEACTIVE"

    credentials = {"email": new_user_payload["email"], "password": new_user_payload["password"]}
    assert (await client.post("/api/v1/auth/login", json=credentials)).status_code == 401

    activated = await client.patch(f"/api/v1/auth/users/{user_id}/activate", headers=chief)
    assert activated.json()["status"] == "ACTIVE"
    assert (await client.post("/api/v1/auth/login", json=credentials)).status_code == 200


async def test_duplicate_email_is_rejected(client, chief, new_user_payload, cleanup_created_users):
    assert (await client.post("/api/v1/auth/users", json=new_user_payload, headers=chief)).status_code == 201
    duplicate = {**new_user_payload, "phone": "0123456789", "citizen_id": "012345678901"}
    assert (await client.post("/api/v1/auth/users", json=duplicate, headers=chief)).status_code == 400


async def test_chief_cannot_deactivate_own_account(client, chief):
    me = (await client.get("/api/v1/auth/me", headers=chief)).json()
    response = await client.delete(f"/api/v1/auth/users/{me['id']}", headers=chief)
    assert response.status_code == 409


async def test_invalid_and_unknown_user_ids(client, chief):
    assert (await client.delete("/api/v1/auth/users/not-a-uuid", headers=chief)).status_code == 400
    assert (await client.delete(f"/api/v1/auth/users/{uuid.uuid4()}", headers=chief)).status_code == 404


async def test_profile_update_roundtrip(client, accountant):
    original = (await client.get("/api/v1/auth/me", headers=accountant)).json()
    payload = {"full_name": original["full_name"], "address": "Địa chỉ kiểm thử", "phone": "0987654321"}
    try:
        updated = await client.patch("/api/v1/auth/me", json=payload, headers=accountant)
        assert updated.status_code == 200
        assert updated.json()["address"] == "Địa chỉ kiểm thử"
    finally:
        restore = {"full_name": original["full_name"], "address": original["address"], "phone": original["phone"]}
        await client.patch("/api/v1/auth/me", json=restore, headers=accountant)


async def test_password_change_request_rejects_weak_new_password(client, accountant):
    response = await client.post(
        "/api/v1/auth/password/otp",
        json={"current_password": "123456", "new_password": "abcdefgh", "confirm_password": "abcdefgh"},
        headers=accountant,
    )
    assert response.status_code == 422


async def test_audit_logs_are_scoped_by_role(client, chief, accountant):
    me = (await client.get("/api/v1/auth/me", headers=accountant)).json()
    own = await client.get("/api/v1/audit-logs", params={"page_size": 100}, headers=accountant)
    assert own.status_code == 200
    assert all(item["user_id"] == me["id"] for item in own.json()["items"])

    everything = await client.get("/api/v1/audit-logs", params={"page_size": 5}, headers=chief)
    assert everything.status_code == 200
    assert len(everything.json()["items"]) <= 5

    filtered = await client.get("/api/v1/audit-logs", params={"action": "LOGIN_SUCCESS"}, headers=chief)
    assert all("LOGIN_SUCCESS" in item["action"] for item in filtered.json()["items"])
    assert (await client.get("/api/v1/audit-logs", params={"page": 0}, headers=chief)).status_code == 422

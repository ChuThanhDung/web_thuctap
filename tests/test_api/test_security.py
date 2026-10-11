import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import delete

from src.config import Settings, get_settings
from src.models.audit_log import AuditLog
from src.models.role import Role
from src.models.user import User
from src.services.auth import (
    LEGACY_DEFAULT_PASSWORD,
    hash_password,
    lock_known_default_password_accounts,
    verify_password,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture
def cleanup_login_audit(db_session):
    yield
    db_session.execute(
        delete(AuditLog).where(
            AuditLog.action.in_(["LOGIN_FAILED", "LOGIN_BLOCKED"]),
            AuditLog.details["email"].astext.like("ratelimit-%"),
        )
    )
    db_session.commit()


async def test_login_is_blocked_after_too_many_failures(client, cleanup_login_audit):
    email = f"ratelimit-{uuid.uuid4().hex[:8]}@example.com"
    limit = get_settings().login_max_attempts

    for _ in range(limit):
        response = await client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"})
        assert response.status_code == 401

    blocked = await client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) == get_settings().login_lockout_minutes * 60


async def test_other_email_is_not_blocked_by_single_email_lockout(client, cleanup_login_audit):
    email = f"ratelimit-{uuid.uuid4().hex[:8]}@example.com"
    for _ in range(get_settings().login_max_attempts):
        await client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"})

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "accountant@docusync.ai", "password": "123456"},
    )
    # Cùng IP nhưng email khác: chỉ bị chặn nếu vượt ngưỡng theo IP (cao hơn nhiều).
    assert response.status_code == 200


async def test_upload_larger_than_limit_is_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1024)
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "accountant@docusync.ai", "password": "123456"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await client.post(
        "/api/v1/uploads",
        files={"file": ("big.pdf", b"%PDF-1.4\n" + b"0" * 2048, "application/pdf")},
        data={"doc_type": "invoice"},
        headers=headers,
    )
    assert response.status_code == 413


async def test_production_rejects_default_database_password():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://admin:Admin%40123@db:5432/docusyncai",
            _env_file=None,
        )


async def test_production_rejects_weak_seed_password():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://admin:S3cure-Pass@db:5432/docusyncai",
            seed_default_password="123456",
            _env_file=None,
        )


async def test_production_accepts_strong_configuration():
    settings = Settings(
        app_env="production",
        database_url="postgresql+psycopg://admin:S3cure-Pass@db:5432/docusyncai",
        seed_default_password="a-long-random-secret",
        _env_file=None,
    )
    assert settings.app_env == "production"


async def test_default_password_accounts_are_rotated_only_in_production(db_session):
    role = db_session.query(Role).first()
    email = f"weak-{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        email=email,
        password_hash=hash_password(LEGACY_DEFAULT_PASSWORD),
        full_name="Weak Password User",
        role_id=role.id,
        status="ACTIVE",
    )
    db_session.add(user)
    db_session.commit()
    try:
        flagged = lock_known_default_password_accounts(db_session, production=False, users=[user])
        assert email in flagged
        db_session.refresh(user)
        assert verify_password(LEGACY_DEFAULT_PASSWORD, user.password_hash)

        flagged = lock_known_default_password_accounts(db_session, production=True, users=[user])
        assert email in flagged
        db_session.refresh(user)
        assert not verify_password(LEGACY_DEFAULT_PASSWORD, user.password_hash)
    finally:
        db_session.delete(user)
        db_session.commit()

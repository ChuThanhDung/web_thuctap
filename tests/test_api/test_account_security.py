"""Bảo mật: xác thực hai lớp, chính sách và lịch sử mật khẩu, mã hóa và che CCCD, đọc XML an toàn.

Đăng nhập thật trên công ty riêng của từng test (tạo bằng make_company của test hạn mức).
"""

import time
import uuid

import pyotp
import pytest
from sqlalchemy import select, text

from src.config import get_settings
from src.database import SessionLocal, use_system_context
from src.main import protect_personal_data
from src.models.audit_log import AuditLog
from src.models.user import User
from tests.test_api.test_billing_and_limits import PASSWORD, make_company


async def login_step(client, email, password=PASSWORD):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


async def enable_mfa(client, headers):
    """Cài 2FA cho người đang đăng nhập. Trả về (khóa, danh sách mã khôi phục)."""
    setup = (await client.post("/api/v1/auth/mfa/setup", headers=headers)).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/")
    assert setup["qr_svg"].startswith("data:image/svg+xml")
    code = pyotp.TOTP(setup["secret"]).now()
    enabled = await client.post("/api/v1/auth/mfa/enable", headers=headers, json={"code": code})
    assert enabled.status_code == 200, enabled.text
    return setup["secret"], enabled.json()["recovery_codes"]


def next_code(secret):
    """Mã của bước thời gian kế tiếp (mã hiện tại vừa dùng thì không dùng lại được)."""
    return pyotp.TOTP(secret).at(time.time() + 30)


@pytest.fixture
def enforce_mfa(monkeypatch):
    monkeypatch.setattr(get_settings(), "mfa_enforced", True)


# --- Xác thực hai lớp ---------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_needs_the_second_factor_once_mfa_is_on(client):
    _, _, accountant = make_company()
    first = await login_step(client, accountant)
    assert first["mfa_required"] is False
    secret, recovery_codes = await enable_mfa(client, bearer(first["access_token"]))
    assert len(recovery_codes) == 10

    step = await login_step(client, accountant)
    assert step["mfa_required"] is True
    assert step["access_token"] is None
    # Mã tạm của bước hai không phải phiên đăng nhập.
    assert (await client.get("/api/v1/auth/me", headers=bearer(step["mfa_token"]))).status_code == 401

    wrong = await client.post("/api/v1/auth/login/mfa", json={"mfa_token": step["mfa_token"], "code": "000000"})
    assert wrong.status_code == 400
    code = next_code(secret)
    ok = await client.post("/api/v1/auth/login/mfa", json={"mfa_token": step["mfa_token"], "code": code})
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["mfa_enabled"] is True
    # Mã tạm chỉ dùng một lần, và cùng một mã 6 số không dùng lại được ở lượt sau.
    again = await client.post("/api/v1/auth/login/mfa", json={"mfa_token": step["mfa_token"], "code": code})
    assert again.status_code == 401
    replay_step = await login_step(client, accountant)
    replay = await client.post("/api/v1/auth/login/mfa", json={"mfa_token": replay_step["mfa_token"], "code": code})
    assert replay.status_code == 400

    # Mã khôi phục dùng được đúng một lần.
    recovery = await client.post(
        "/api/v1/auth/login/mfa", json={"mfa_token": replay_step["mfa_token"], "code": recovery_codes[0]}
    )
    assert recovery.status_code == 200
    reused_step = await login_step(client, accountant)
    reused = await client.post(
        "/api/v1/auth/login/mfa", json={"mfa_token": reused_step["mfa_token"], "code": recovery_codes[0]}
    )
    assert reused.status_code == 400


@pytest.mark.asyncio
async def test_second_step_locks_after_too_many_wrong_codes(client):
    _, _, accountant = make_company()
    secret, _ = await enable_mfa(client, bearer((await login_step(client, accountant))["access_token"]))
    step = await login_step(client, accountant)
    for _ in range(get_settings().mfa_max_attempts - 1):
        assert (
            await client.post("/api/v1/auth/login/mfa", json={"mfa_token": step["mfa_token"], "code": "111111"})
        ).status_code == 400
    assert (
        await client.post("/api/v1/auth/login/mfa", json={"mfa_token": step["mfa_token"], "code": "111111"})
    ).status_code == 401
    # Đã khóa: mã đúng cũng không vào được bằng mã tạm này.
    locked = await client.post(
        "/api/v1/auth/login/mfa", json={"mfa_token": step["mfa_token"], "code": next_code(secret)}
    )
    assert locked.status_code == 401


@pytest.mark.asyncio
async def test_chief_must_set_up_mfa_before_using_the_app(client, enforce_mfa):
    _, chief, accountant = make_company()
    step = await login_step(client, chief)
    assert step["user"]["mfa_setup_required"] is True
    headers = bearer(step["access_token"])
    assert (await client.get("/api/v1/uploads/batches", headers=headers)).status_code == 403
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200
    # Điều khoản mới phải đồng ý được trước khi bật 2FA (giao diện hỏi điều khoản trước), nếu không sẽ kẹt.
    assert (await client.post("/api/v1/auth/terms/accept", headers=headers)).status_code == 200

    await enable_mfa(client, headers)
    assert (await client.get("/api/v1/uploads/batches", headers=headers)).status_code == 200
    # Kế toán trưởng không tự tắt được khi vai trò bắt buộc.
    disable = await client.post(
        "/api/v1/auth/mfa/disable", headers=headers, json={"password": PASSWORD, "code": "123456"}
    )
    assert disable.status_code == 409

    # Kế toán viên không bắt buộc.
    accountant_step = await login_step(client, accountant)
    assert accountant_step["user"]["mfa_setup_required"] is False
    assert (
        await client.get("/api/v1/uploads/batches", headers=bearer(accountant_step["access_token"]))
    ).status_code == 200


@pytest.mark.asyncio
async def test_accountant_disables_own_mfa_and_chief_can_reset_it(client):
    _, chief, accountant = make_company()
    accountant_headers = bearer((await login_step(client, accountant))["access_token"])
    secret, _ = await enable_mfa(client, accountant_headers)

    bad = await client.post(
        "/api/v1/auth/mfa/disable",
        headers=accountant_headers,
        json={"password": "sai-mat-khau-1", "code": next_code(secret)},
    )
    assert bad.status_code == 400
    ok = await client.post(
        "/api/v1/auth/mfa/disable", headers=accountant_headers, json={"password": PASSWORD, "code": next_code(secret)}
    )
    assert ok.status_code == 200
    assert ok.json()["mfa_enabled"] is False

    await enable_mfa(client, accountant_headers)
    chief_headers = bearer((await login_step(client, chief))["access_token"])
    users = (await client.get("/api/v1/auth/users", headers=chief_headers)).json()["items"]
    accountant_id = next(u["id"] for u in users if u["email"] == accountant)
    reset = await client.post(f"/api/v1/auth/users/{accountant_id}/mfa/reset", headers=chief_headers)
    assert reset.status_code == 200
    assert (await login_step(client, accountant))["mfa_required"] is False


# --- Mật khẩu -----------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_policy_and_no_reuse_of_recent_passwords(client, monkeypatch):
    sent = []
    monkeypatch.setattr("src.services.auth.send_otp_email", lambda to, otp: sent.append(otp) or True)
    monkeypatch.setattr("src.services.auth.send_password_changed_email", lambda to: True)
    monkeypatch.setattr(get_settings(), "password_otp_resend_seconds", 10)
    _, _, accountant = make_company()
    headers = bearer((await login_step(client, accountant))["access_token"])

    async def change(current, new):
        return await client.post(
            "/api/v1/auth/password/otp",
            headers=headers,
            json={"current_password": current, "new_password": new, "confirm_password": new},
        )

    assert (await change(PASSWORD, "Ngan-123")).status_code == 422  # dưới 10 ký tự
    assert (await change(PASSWORD, "matkhau123")).status_code == 422  # mật khẩu phổ biến

    new_password = "Doi-mat-khau-2026"
    assert (await change(PASSWORD, new_password)).status_code == 200
    verified = await client.post("/api/v1/auth/password/otp/verify", headers=headers, json={"otp": sent[-1]})
    assert verified.status_code == 200, verified.text

    # Đổi ngay về mật khẩu cũ: bị chặn vì nằm trong 3 mật khẩu gần nhất.
    with SessionLocal() as db:
        use_system_context(db)
        db.execute(text("UPDATE password_reset_otps SET created_at = created_at - interval '1 hour'"))
        db.commit()
    reuse = await change(new_password, PASSWORD)
    assert reuse.status_code == 400
    assert "3 mật khẩu gần nhất" in reuse.json()["detail"]


# --- CCCD ---------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_citizen_id_is_encrypted_masked_and_revealed_only_to_chief(client):
    _, chief, accountant = make_company(plan="pro")
    _, other_chief, _ = make_company(plan="pro")
    chief_headers = bearer((await login_step(client, chief))["access_token"])
    body = {
        "email": f"cccd-{uuid.uuid4().hex[:8]}@example.com",
        "password": "Nhan-vien-2026",
        "full_name": "Nhân Viên Mới",
        "role_code": "accountant",
        "phone": "0901234567",
        "citizen_id": "001204005678",
        "address": "12 Phố Huế, Hà Nội",
    }
    created = await client.post("/api/v1/auth/users", headers=chief_headers, json=body)
    assert created.status_code == 201, created.text
    assert created.json()["citizen_id"] == "0012****5678"

    with SessionLocal() as db:
        use_system_context(db)
        raw = db.execute(
            text("SELECT citizen_id, address, citizen_id_hash FROM users WHERE email = :email"),
            {"email": body["email"]},
        ).one()
    assert raw.citizen_id.startswith("enc:v1:") and "001204005678" not in raw.citizen_id
    assert raw.address.startswith("enc:v1:")
    assert raw.citizen_id_hash

    revealed = await client.get(f"/api/v1/auth/users/{created.json()['id']}/citizen-id", headers=chief_headers)
    assert revealed.json()["citizen_id"] == "001204005678"
    with SessionLocal() as db:
        use_system_context(db)
        assert db.scalars(
            select(AuditLog).where(AuditLog.action == "CITIZEN_ID_VIEWED", AuditLog.target_id == created.json()["id"])
        ).first()

    accountant_headers = bearer((await login_step(client, accountant))["access_token"])
    assert (
        await client.get(f"/api/v1/auth/users/{created.json()['id']}/citizen-id", headers=accountant_headers)
    ).status_code == 403
    other_headers = bearer((await login_step(client, other_chief))["access_token"])
    assert (
        await client.get(f"/api/v1/auth/users/{created.json()['id']}/citizen-id", headers=other_headers)
    ).status_code == 404

    # Trùng CCCD trong cùng công ty bị chặn dù CCCD lưu mã hóa; công ty khác thì được.
    duplicate = {**body, "email": f"dup-{uuid.uuid4().hex[:8]}@example.com"}
    assert (await client.post("/api/v1/auth/users", headers=chief_headers, json=duplicate)).status_code == 400
    elsewhere = {**body, "email": f"else-{uuid.uuid4().hex[:8]}@example.com"}
    assert (await client.post("/api/v1/auth/users", headers=other_headers, json=elsewhere)).status_code == 201


def test_startup_encrypts_personal_data_left_in_plain_text():
    org_id, chief, _ = make_company()
    with SessionLocal() as db:
        use_system_context(db)
        db.execute(
            text(
                "UPDATE users SET citizen_id = '079300001111', address = 'Quận 1', citizen_id_hash = NULL WHERE email = :e"
            ),
            {"e": chief},
        )
        db.commit()
    protect_personal_data()
    with SessionLocal() as db:
        use_system_context(db)
        raw = db.execute(
            text("SELECT citizen_id, address, citizen_id_hash FROM users WHERE email = :e"), {"e": chief}
        ).one()
        user = db.scalars(select(User).where(User.email == chief)).one()
    assert raw.citizen_id.startswith("enc:v1:") and raw.address.startswith("enc:v1:")
    assert raw.citizen_id_hash
    assert user.citizen_id == "079300001111"
    assert user.address == "Quận 1"


# --- XML an toàn --------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_xml_with_entity_expansion_is_refused(client):
    _, _, accountant = make_company()
    headers = bearer((await login_step(client, accountant))["access_token"])
    bomb = (
        b'<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;">'
        b'<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;">]><DonDatHang><SoDon>&lol3;</SoDon></DonDatHang>'
    )
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    response = await client.post(
        "/api/v1/uploads",
        headers=headers,
        data={"doc_type": "po", "batch_id": str(batch["id"])},
        files={"file": ("po.xml", bomb, "application/xml")},
    )
    assert response.status_code == 422


def test_production_rejects_a_malformed_encryption_key():
    from pydantic import ValidationError

    from src.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://admin:S3cure-Pass@db:5432/docusyncai",
            data_encryption_key="khong-phai-khoa-fernet",
            _env_file=None,
        )

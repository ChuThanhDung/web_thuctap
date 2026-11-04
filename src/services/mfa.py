"""Xác thực hai lớp bằng mã TOTP 6 số (Google Authenticator, Microsoft Authenticator...) và mã khôi phục.

Đăng nhập khi đã bật 2FA: mật khẩu đúng → cấp mã tạm (MfaChallenge, 5 phút, tối đa 5 lần nhập) → nhập đúng mã 6 số
hoặc một mã khôi phục → tạo phiên. Mỗi mã 6 số chỉ dùng được một lần (ghi lại bước thời gian đã dùng).
"""

import hashlib
import secrets
import time
from datetime import UTC, datetime, timedelta

import pyotp
import segno
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.config import get_settings
from src.models.security import MfaChallenge
from src.models.user import User
from src.services.auth import hash_token

ISSUER = "DocuSync AI"
MFA_REQUIRED_ROLES = ("chief_accountant", "platform_admin")
RECOVERY_CODE_COUNT = 10
RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
STEP_SECONDS = 30


class MfaError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def mfa_enabled(user: User) -> bool:
    return user.totp_enabled_at is not None and bool(user.totp_secret)


def mfa_required(user: User) -> bool:
    return get_settings().mfa_enforced and user.role.code in MFA_REQUIRED_ROLES


def mfa_setup_pending(user: User) -> bool:
    """Vai trò bắt buộc 2FA nhưng chưa bật: chỉ được vào màn hình cài đặt 2FA."""
    return mfa_required(user) and not mfa_enabled(user)


# --- Cài đặt ------------------------------------------------------------------------------------------------------


def start_setup(user: User) -> tuple[str, str, str]:
    """Sinh khóa mới (chưa bật). Trả về (khóa, otpauth URI, ảnh QR dạng data URI SVG). Gọi lại thì đổi khóa."""
    if mfa_enabled(user):
        raise MfaError("Xác thực hai lớp đang bật. Tắt trước khi cài lại.", status_code=409)
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_last_step = None
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=ISSUER)
    qr = segno.make(uri, error="m").svg_data_uri(scale=5, border=2)
    return secret, uri, qr


def _normalize(code: str) -> str:
    return code.replace(" ", "").replace("-", "").upper()


def _hash_recovery(code: str) -> str:
    return hashlib.sha256(_normalize(code).encode()).hexdigest()


def new_recovery_codes(user: User) -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    user.totp_recovery_codes = [_hash_recovery(code) for code in codes]
    return codes


def verify_totp(user: User, code: str, now: float | None = None) -> bool:
    """Mã đúng trong khoảng ±30 giây và chưa dùng. Đúng thì ghi lại bước thời gian (không commit)."""
    code = _normalize(code)
    if not user.totp_secret or len(code) != 6 or not code.isdigit():
        return False
    totp = pyotp.TOTP(user.totp_secret)
    current = int((now or time.time()) // STEP_SECONDS)
    for step in (current - 1, current, current + 1):
        if user.totp_last_step is not None and step <= user.totp_last_step:
            continue
        if secrets.compare_digest(totp.at(step * STEP_SECONDS), code):
            user.totp_last_step = step
            return True
    return False


def use_recovery_code(user: User, code: str) -> bool:
    """Mã khôi phục đúng thì xóa khỏi danh sách (dùng một lần). Không commit."""
    hashes = list(user.totp_recovery_codes or [])
    digest = _hash_recovery(code)
    for stored in hashes:
        if secrets.compare_digest(stored, digest):
            hashes.remove(stored)
            user.totp_recovery_codes = hashes
            return True
    return False


def verify_second_factor(user: User, code: str) -> str | None:
    """Trả về 'totp' hoặc 'recovery_code' nếu đúng, None nếu sai."""
    if verify_totp(user, code):
        return "totp"
    if len(_normalize(code)) == 8 and use_recovery_code(user, code):
        return "recovery_code"
    return None


def enable(db: Session, user: User, code: str) -> list[str]:
    if mfa_enabled(user):
        raise MfaError("Xác thực hai lớp đã bật.", status_code=409)
    if not user.totp_secret:
        raise MfaError("Chưa có mã cài đặt. Hãy bắt đầu lại.")
    if not verify_totp(user, code):
        raise MfaError("Mã không đúng. Kiểm tra giờ trên điện thoại và nhập mã mới nhất.")
    user.totp_enabled_at = datetime.now(UTC)
    codes = new_recovery_codes(user)
    db.commit()
    return codes


def disable(db: Session, user: User) -> None:
    user.totp_secret = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    user.totp_recovery_codes = None
    db.commit()


# --- Đăng nhập bước hai -------------------------------------------------------------------------------------------


def create_challenge(db: Session, user: User, ip_address: str | None) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        MfaChallenge(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(seconds=get_settings().mfa_challenge_ttl_seconds),
            ip_address=ip_address,
        )
    )
    db.commit()
    return token


def complete_challenge(db: Session, token: str, code: str) -> tuple[User, str]:
    """Kiểm tra mã 2FA của lượt đăng nhập. Trả về (người dùng, cách xác thực)."""
    settings = get_settings()
    challenge = db.scalars(
        select(MfaChallenge).where(MfaChallenge.token_hash == hash_token(token)).with_for_update()
    ).first()
    now = datetime.now(UTC)
    if challenge is None or challenge.used_at is not None or challenge.expires_at <= now:
        raise MfaError("Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.", status_code=401)
    if challenge.attempt_count >= settings.mfa_max_attempts:
        raise MfaError("Nhập sai quá nhiều lần. Vui lòng đăng nhập lại.", status_code=401)

    user = db.scalars(
        select(User).options(selectinload(User.role)).where(User.id == challenge.user_id).with_for_update()
    ).one()
    method = verify_second_factor(user, code)
    if method is None:
        challenge.attempt_count += 1
        db.commit()
        remaining = settings.mfa_max_attempts - challenge.attempt_count
        if remaining <= 0:
            raise MfaError("Nhập sai quá nhiều lần. Vui lòng đăng nhập lại.", status_code=401)
        raise MfaError(f"Mã không đúng. Bạn còn {remaining} lần thử.")
    challenge.used_at = now
    db.commit()
    return user, method

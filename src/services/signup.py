"""Tự đăng ký công ty và mời người dùng vào công ty.

Đăng ký: lưu yêu cầu kèm OTP gửi qua email; nhập đúng OTP thì tạo công ty (dùng thử Pro 14 ngày) và tài khoản kế toán
trưởng. Lời mời: kế toán trưởng mời qua email, người nhận mở link để đặt mật khẩu và vào thẳng công ty.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from secrets import randbelow, token_urlsafe

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from src.config import get_settings
from src.database import set_organization_context, use_system_context
from src.models.role import Role
from src.models.signup import SignupRequest, UserInvitation
from src.models.user import User
from src.services.auth import (
    build_next_employee_code,
    email_in_use,
    hash_password,
    hash_token,
    next_public_user_id,
    normalize_email,
    verify_password,
)
from src.services.email import is_smtp_configured, send_invitation_email, send_signup_otp_email
from src.services.organizations import create_organization
from src.services.plans import PlanLimitError, ensure_can_add_user
from src.services.privacy import TERMS_VERSION, record_terms_acceptance

logger = logging.getLogger(__name__)

COMPANY_ROLES = ("accountant", "chief_accountant")
DEFAULT_DEPARTMENT = "Phòng Kế toán - Tài chính"
MAX_PENDING_INVITATIONS = 50


class SignupError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400, retry_after: int | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


def _deliver(sent: bool, kind: str, to_email: str, secret: str) -> bool:
    """Ngoài production, khi chưa cấu hình SMTP thì ghi mã ra log để dev vẫn thử được luồng; production thì báo lỗi."""
    if sent:
        return True
    settings = get_settings()
    if settings.app_env != "production" and not is_smtp_configured():
        logger.warning("SMTP chưa cấu hình (môi trường %s): %s cho %s là %s", settings.app_env, kind, to_email, secret)
        return True
    return False


# --- Đăng ký ------------------------------------------------------------------------------------------------------


def _check_signup_rate_limit(db: Session, email: str, ip_address: str | None) -> None:
    settings = get_settings()
    since = datetime.now(UTC) - timedelta(hours=1)
    recent = select(func.count(SignupRequest.id)).where(SignupRequest.created_at >= since)
    by_email = db.scalar(recent.where(SignupRequest.email == email)) or 0
    by_ip = (db.scalar(recent.where(SignupRequest.ip_address == ip_address)) or 0) if ip_address else 0
    if by_email >= settings.signup_max_per_email_per_hour or by_ip >= settings.signup_max_per_ip_per_hour:
        raise SignupError(
            "Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau 1 giờ.", status_code=429, retry_after=3600
        )


def _new_otp() -> str:
    return f"{randbelow(1_000_000):06d}"


def start_signup(
    db: Session,
    *,
    company_name: str,
    tax_id: str | None,
    full_name: str,
    email: str,
    password: str,
    ip_address: str | None,
) -> SignupRequest:
    """Tạo yêu cầu đăng ký và gửi OTP. Phiên phải ở chế độ hệ thống (chưa đăng nhập)."""
    settings = get_settings()
    if not settings.signup_enabled:
        raise SignupError("Hiện chưa mở đăng ký. Vui lòng liên hệ để được cấp tài khoản.", status_code=403)

    email = normalize_email(email)
    _check_signup_rate_limit(db, email, ip_address)
    if email_in_use(email):
        raise SignupError("Email này đã có tài khoản. Vui lòng đăng nhập hoặc dùng email khác.", status_code=409)

    now = datetime.now(UTC)
    otp = _new_otp()
    request = SignupRequest(
        id=uuid.uuid4(),
        email=email,
        company_name=company_name.strip(),
        tax_id=tax_id.strip() if tax_id else None,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        otp_hash=hash_password(otp),
        ip_address=ip_address,
        terms_accepted_at=now,
        terms_version=TERMS_VERSION,
        otp_sent_at=now,
        expires_at=now + timedelta(seconds=settings.password_otp_ttl_seconds),
    )
    db.add(request)
    db.commit()

    sent = send_signup_otp_email(email, request.company_name, otp)
    if not _deliver(sent, "OTP đăng ký", email, otp):
        db.delete(request)
        db.commit()
        raise SignupError("Không gửi được email xác thực. Vui lòng thử lại sau.", status_code=503)
    return request


def _get_pending_signup(db: Session, signup_id: uuid.UUID) -> SignupRequest:
    request = db.scalars(select(SignupRequest).where(SignupRequest.id == signup_id).with_for_update()).first()
    if request is None or request.verified_at is not None:
        raise SignupError("Yêu cầu đăng ký không còn hiệu lực. Vui lòng đăng ký lại.", status_code=404)
    return request


def resend_signup_otp(db: Session, signup_id: uuid.UUID) -> SignupRequest:
    settings = get_settings()
    request = _get_pending_signup(db, signup_id)
    now = datetime.now(UTC)
    elapsed = (now - request.otp_sent_at).total_seconds()
    if elapsed < settings.password_otp_resend_seconds:
        retry_after = max(1, int(settings.password_otp_resend_seconds - elapsed + 0.999))
        raise SignupError(
            f"Vui lòng chờ {retry_after} giây trước khi gửi lại mã.", status_code=429, retry_after=retry_after
        )
    if now - request.created_at > timedelta(hours=1):
        raise SignupError("Yêu cầu đăng ký đã quá hạn. Vui lòng đăng ký lại.", status_code=404)

    otp = _new_otp()
    request.otp_hash = hash_password(otp)
    request.attempt_count = 0
    request.otp_sent_at = now
    request.expires_at = now + timedelta(seconds=settings.password_otp_ttl_seconds)
    db.commit()
    sent = send_signup_otp_email(request.email, request.company_name, otp)
    if not _deliver(sent, "OTP đăng ký", request.email, otp):
        raise SignupError("Không gửi được email xác thực. Vui lòng thử lại sau.", status_code=503)
    return request


def _role(db: Session, code: str) -> Role:
    role = db.scalars(select(Role).where(Role.code == code)).first()
    if role is None:
        raise SignupError(f"Thiếu vai trò '{code}' trong hệ thống.", status_code=500)
    return role


def _load_user(db: Session, user_id: uuid.UUID) -> User:
    return db.scalars(
        select(User).options(selectinload(User.role), selectinload(User.organization)).where(User.id == user_id)
    ).one()


def complete_signup(db: Session, signup_id: uuid.UUID, otp: str) -> User:
    """Kiểm tra OTP; đúng thì tạo công ty và tài khoản kế toán trưởng, trả về người dùng mới để đăng nhập luôn."""
    settings = get_settings()
    request = _get_pending_signup(db, signup_id)
    now = datetime.now(UTC)
    if request.expires_at <= now:
        raise SignupError("Mã xác thực đã hết hạn. Vui lòng gửi lại mã mới.")
    if request.attempt_count >= settings.password_otp_max_attempts:
        raise SignupError("Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.")
    if not verify_password(otp, request.otp_hash):
        request.attempt_count += 1
        db.commit()
        remaining = settings.password_otp_max_attempts - request.attempt_count
        if remaining <= 0:
            raise SignupError("Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.")
        raise SignupError(f"Mã xác thực không đúng. Bạn còn {remaining} lần thử.")
    if email_in_use(request.email):
        raise SignupError("Email này đã có tài khoản. Vui lòng đăng nhập.", status_code=409)

    use_system_context(db)
    organization = create_organization(db, request.company_name, request.tax_id)
    request.verified_at = now
    request.organization_id = organization.id
    request.otp_hash = "-"
    # Từ đây ghi trong công ty mới, để mã nhân viên được đánh số riêng của công ty.
    set_organization_context(db, organization.id)
    role = _role(db, "chief_accountant")
    user = User(
        organization_id=organization.id,
        public_id=next_public_user_id(db),
        email=request.email,
        password_hash=request.password_hash,
        full_name=request.full_name,
        role_id=role.id,
        department=DEFAULT_DEPARTMENT,
        employee_code=build_next_employee_code(db, role.code),
        status="ACTIVE",
    )
    record_terms_acceptance(user, request.terms_version or TERMS_VERSION, request.terms_accepted_at)
    db.add(user)
    db.commit()
    # Người dùng chưa đăng nhập: trả phiên về chế độ hệ thống để tạo phiên đăng nhập và nhật ký.
    use_system_context(db)
    return _load_user(db, user.id)


# --- Lời mời ------------------------------------------------------------------------------------------------------


def list_pending_invitations(db: Session) -> list[UserInvitation]:
    """Lời mời đang chờ của công ty hiện tại (RLS giới hạn trong công ty)."""
    now = datetime.now(UTC)
    return db.scalars(
        select(UserInvitation)
        .where(
            UserInvitation.accepted_at.is_(None),
            UserInvitation.revoked_at.is_(None),
            UserInvitation.expires_at > now,
        )
        .order_by(UserInvitation.created_at.desc())
    ).all()


def create_invitation(
    db: Session, inviter: User, *, email: str, full_name: str, role_code: str
) -> tuple[UserInvitation, str]:
    """Tạo lời mời trong công ty của người mời. Trả về (lời mời, mã mời gốc để đưa vào link)."""
    if role_code not in COMPANY_ROLES:
        raise SignupError("Vai trò không hợp lệ.")
    email = normalize_email(email)
    if email_in_use(email):
        raise SignupError("Email này đã có tài khoản trong hệ thống.", status_code=409)
    pending = list_pending_invitations(db)
    if len(pending) >= MAX_PENDING_INVITATIONS:
        raise SignupError("Công ty có quá nhiều lời mời đang chờ. Hãy thu hồi bớt lời mời cũ.", status_code=429)

    now = datetime.now(UTC)
    # Mời lại cùng email thì lời mời cũ hết hiệu lực, chỉ link mới nhất dùng được.
    for invitation in pending:
        if invitation.email == email:
            invitation.revoked_at = now
    db.flush()
    try:
        ensure_can_add_user(db, inviter.organization)
    except PlanLimitError:
        db.rollback()
        raise

    token = token_urlsafe(32)
    invitation = UserInvitation(
        id=uuid.uuid4(),
        organization_id=inviter.organization_id,
        email=email,
        full_name=full_name.strip(),
        role_code=role_code,
        token_hash=hash_token(token),
        invited_by_id=inviter.id,
        expires_at=now + timedelta(days=get_settings().invitation_ttl_days),
    )
    db.add(invitation)
    db.commit()
    return invitation, token


def send_invitation(invitation: UserInvitation, token: str, inviter: User, frontend_base_url: str) -> str:
    """Gửi email lời mời; trả về link nhận lời mời (kế toán trưởng có thể tự gửi link nếu email không tới)."""
    accept_url = f"{frontend_base_url}/nhan-loi-moi?token={token}"
    organization = inviter.organization
    role_name = "Kế toán trưởng" if invitation.role_code == "chief_accountant" else "Kế toán viên"
    sent = send_invitation_email(
        invitation.email,
        invitation.full_name,
        organization.name if organization else "",
        inviter.full_name,
        role_name,
        accept_url,
        get_settings().invitation_ttl_days,
    )
    if not _deliver(sent, "link mời", invitation.email, accept_url):
        logger.warning("Không gửi được email mời tới %s; kế toán trưởng có thể gửi link thủ công.", invitation.email)
    return accept_url


def revoke_invitation(db: Session, invitation_id: uuid.UUID) -> UserInvitation:
    invitation = db.get(UserInvitation, invitation_id)
    if invitation is None or invitation.accepted_at is not None:
        raise SignupError("Không tìm thấy lời mời.", status_code=404)
    invitation.revoked_at = invitation.revoked_at or datetime.now(UTC)
    db.commit()
    return invitation


def find_invitation_by_token(db: Session, token: str) -> UserInvitation:
    """Tìm lời mời còn hiệu lực theo mã trong link. Phiên ở chế độ hệ thống (người nhận chưa có tài khoản)."""
    invitation = db.scalars(
        select(UserInvitation)
        .options(selectinload(UserInvitation.organization))
        .where(UserInvitation.token_hash == hash_token(token))
    ).first()
    now = datetime.now(UTC)
    if (
        invitation is None
        or invitation.accepted_at is not None
        or invitation.revoked_at is not None
        or invitation.expires_at <= now
    ):
        raise SignupError("Lời mời không còn hiệu lực. Hãy nhờ kế toán trưởng gửi lại.", status_code=404)
    if invitation.organization.status != "active":
        raise SignupError("Công ty này đang tạm khóa.", status_code=403)
    return invitation


def accept_invitation(db: Session, token: str, password: str, full_name: str | None = None) -> User:
    invitation = find_invitation_by_token(db, token)
    if email_in_use(invitation.email):
        raise SignupError("Email này đã có tài khoản. Vui lòng đăng nhập.", status_code=409)

    organization_id = invitation.organization_id
    set_organization_context(db, organization_id)
    role = _role(db, invitation.role_code)
    user = User(
        organization_id=organization_id,
        public_id=next_public_user_id(db),
        email=invitation.email,
        password_hash=hash_password(password),
        full_name=(full_name or invitation.full_name).strip(),
        role_id=role.id,
        department=DEFAULT_DEPARTMENT,
        employee_code=build_next_employee_code(db, role.code),
        status="ACTIVE",
    )
    # Người nhận lời mời đồng ý điều khoản ngay trên trang nhận lời mời (InvitationAcceptRequest.accept_terms).
    record_terms_acceptance(user)
    db.add(user)
    invitation = db.get(UserInvitation, invitation.id)
    invitation.accepted_at = datetime.now(UTC)
    db.commit()
    use_system_context(db)
    return _load_user(db, user.id)

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import randbelow, token_urlsafe

from passlib.context import CryptContext
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, selectinload

from src.config import get_settings
from src.models.audit_log import AuditLog
from src.models.password_reset_otp import PasswordResetOtp
from src.models.role import Role
from src.models.schemas import UserCreateRequest
from src.models.user import User
from src.models.user_session import UserSession
from src.services.email import send_otp_email, send_password_changed_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class PasswordChangeError(ValueError):
    def __init__(self, message: str, *, retry_after: int | None = None):
        super().__init__(message)
        self.retry_after = retry_after


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def next_public_user_id(db: Session) -> int:
    return (db.scalar(select(func.max(User.public_id))) or 0) + 1


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    stmt = (
        select(User)
        .options(selectinload(User.role))
        .where(
            func.lower(User.email) == email.lower().strip(),
            func.upper(User.status) == "ACTIVE",
        )
    )
    user = db.scalars(stmt).first()

    if not user or not verify_password(password, user.password_hash):
        return None

    return user


def create_user_session(
    db: Session,
    user: User,
    ip_address: str | None,
    user_agent: str | None,
) -> str:
    access_token = token_urlsafe(32)
    session = UserSession(
        user_id=user.id,
        session_token_hash=hash_token(access_token),
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=datetime.now(UTC) + timedelta(hours=12),
    )

    user.last_login_at = datetime.now(UTC)
    db.add(session)
    db.commit()
    db.refresh(user)

    return access_token


def get_user_by_session_token(db: Session, access_token: str) -> User | None:
    stmt = (
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .options(selectinload(User.role))
        .where(
            UserSession.session_token_hash == hash_token(access_token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(UTC),
            func.upper(User.status) == "ACTIVE",
        )
    )
    return db.scalars(stmt).first()


def initiate_password_change(
    db: Session,
    user: User,
    current_password: str,
    new_password: str,
    confirm_password: str,
) -> tuple[int, int]:
    """Validate passwords and email an OTP without persisting any plain-text password."""
    if not verify_password(current_password, user.password_hash):
        raise PasswordChangeError("Mật khẩu hiện tại không đúng.")
    if len(new_password) < 6:
        raise PasswordChangeError("Mật khẩu mới phải có tối thiểu 6 ký tự.")
    if new_password != confirm_password:
        raise PasswordChangeError("Xác nhận mật khẩu mới không khớp.")
    # bcrypt hashes are salted, so compare by verifying the candidate against the stored hash.
    if verify_password(new_password, user.password_hash):
        raise PasswordChangeError("Mật khẩu mới phải khác mật khẩu hiện tại.")

    settings = get_settings()
    now = datetime.now(UTC)
    window_start = now - timedelta(minutes=settings.password_otp_request_window_minutes)
    db.execute(delete(PasswordResetOtp).where(PasswordResetOtp.expires_at < now - timedelta(days=1)))
    latest = db.scalars(
        select(PasswordResetOtp)
        .where(PasswordResetOtp.user_id == user.id)
        .order_by(PasswordResetOtp.created_at.desc())
        .limit(1)
    ).first()
    if latest is not None:
        elapsed = (now - latest.created_at).total_seconds()
        if elapsed < settings.password_otp_resend_seconds:
            retry_after = max(1, int(settings.password_otp_resend_seconds - elapsed + 0.999))
            raise PasswordChangeError(
                f"Vui lòng chờ {retry_after} giây trước khi gửi lại OTP.",
                retry_after=retry_after,
            )

    request_count = db.scalar(
        select(func.count(PasswordResetOtp.id)).where(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.created_at >= window_start,
        )
    ) or 0
    if request_count >= settings.password_otp_max_requests:
        raise PasswordChangeError(
            f"Bạn đã yêu cầu OTP quá nhiều lần. Vui lòng thử lại sau {settings.password_otp_request_window_minutes} phút.",
            retry_after=settings.password_otp_request_window_minutes * 60,
        )

    db.execute(
        update(PasswordResetOtp)
        .where(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.used_at.is_(None),
            PasswordResetOtp.invalidated_at.is_(None),
        )
        .values(invalidated_at=now, pending_password_hash=None)
    )

    otp = f"{randbelow(1_000_000):06d}"
    otp_record = PasswordResetOtp(
        user_id=user.id,
        otp_hash=hash_password(otp),
        pending_password_hash=hash_password(new_password),
        attempt_count=0,
        expires_at=now + timedelta(seconds=settings.password_otp_ttl_seconds),
    )
    db.add(otp_record)
    db.commit()

    if not send_otp_email(user.email, otp):
        db.delete(otp_record)
        db.commit()
        raise PasswordChangeError("Không thể gửi OTP qua email. Vui lòng kiểm tra cấu hình Gmail và thử lại.")

    return settings.password_otp_ttl_seconds, settings.password_otp_resend_seconds


def create_user_by_admin(db: Session, payload: UserCreateRequest) -> User:
    email_clean = payload.email.lower().strip()
    existing_user = db.scalars(select(User).where(User.email == email_clean)).first()
    if existing_user:
        raise ValueError("Email này đã được sử dụng bởi tài khoản khác trong hệ thống.")

    emp_code_clean = payload.employee_code.strip() if payload.employee_code else None
    if emp_code_clean:
        existing_emp = db.scalars(select(User).where(User.employee_code == emp_code_clean)).first()
        if existing_emp:
            raise ValueError("Mã nhân viên này đã tồn tại.")

    role = db.scalars(select(Role).where(Role.code == payload.role_code)).first()
    if not role:
        raise ValueError(f"Vai trò '{payload.role_code}' không hợp lệ.")

    new_user = User(
        public_id=next_public_user_id(db),
        email=email_clean,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role_id=role.id,
        department=payload.department.strip() if payload.department else None,
        employee_code=emp_code_clean,
        phone=payload.phone.strip() if payload.phone else None,
        status="ACTIVE",
    )
    db.add(new_user)
    db.commit()

    stmt = select(User).options(selectinload(User.role)).where(User.id == new_user.id)
    return db.scalars(stmt).first()


def verify_password_change_otp(db: Session, user: User, otp: str, current_session_token: str) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    stmt = (
        select(PasswordResetOtp)
        .where(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.used_at.is_(None),
            PasswordResetOtp.invalidated_at.is_(None),
        )
        .order_by(PasswordResetOtp.created_at.desc())
        .with_for_update()
    )
    otp_record = db.scalars(stmt).first()
    if otp_record is None:
        raise PasswordChangeError("Không có yêu cầu đổi mật khẩu đang hoạt động. Vui lòng gửi lại OTP.")
    if otp_record.expires_at <= now:
        otp_record.invalidated_at = now
        otp_record.pending_password_hash = None
        db.commit()
        raise PasswordChangeError("Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.")
    if otp_record.attempt_count >= settings.password_otp_max_attempts:
        otp_record.invalidated_at = now
        otp_record.pending_password_hash = None
        db.commit()
        raise PasswordChangeError(
            f"Bạn đã nhập sai OTP quá {settings.password_otp_max_attempts} lần. Vui lòng gửi lại mã mới."
        )

    if not verify_password(otp, otp_record.otp_hash):
        otp_record.attempt_count += 1
        remaining = settings.password_otp_max_attempts - otp_record.attempt_count
        if remaining <= 0:
            otp_record.invalidated_at = now
            otp_record.pending_password_hash = None
            db.commit()
            raise PasswordChangeError(
                f"Bạn đã nhập sai OTP quá {settings.password_otp_max_attempts} lần. Vui lòng gửi lại mã mới."
            )
        db.commit()
        raise PasswordChangeError(f"Mã OTP không đúng. Bạn còn {remaining} lần thử.")

    if not otp_record.pending_password_hash:
        otp_record.invalidated_at = now
        db.commit()
        raise PasswordChangeError("Yêu cầu đổi mật khẩu không hợp lệ. Vui lòng thực hiện lại.")

    user.password_hash = otp_record.pending_password_hash
    otp_record.pending_password_hash = None
    otp_record.verified_at = now
    otp_record.used_at = now
    db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.session_token_hash != hash_token(current_session_token),
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    db.commit()
    send_password_changed_email(user.email)


def write_audit_log(
    db: Session,
    action: str,
    user: User | None,
    details: dict | None,
    ip_address: str | None,
    user_agent: str | None,
    target_type: str = "USER",
    target_id: str | None = None,
) -> None:
    resolved_target_id = target_id if target_id else (str(user.id) if user else None)
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            target_type=target_type,
            target_id=resolved_target_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    db.commit()

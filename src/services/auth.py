from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import randbelow, token_urlsafe

from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from src.models.audit_log import AuditLog
from src.models.password_reset_otp import PasswordResetOtp
from src.models.role import Role
from src.models.schemas import UserCreateRequest
from src.models.user import User
from src.models.user_session import UserSession
from src.services.email import send_otp_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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


def create_password_reset_otp(db: Session, user: User) -> str:
    otp = f"{randbelow(1_000_000):06d}"
    db.add(
        PasswordResetOtp(
            user_id=user.id,
            otp_hash=hash_token(otp),
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
    )
    db.commit()
    send_otp_email(user.email, otp)
    return otp


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


def verify_password_reset_otp(db: Session, user: User, otp: str) -> str | None:
    stmt = (
        select(PasswordResetOtp)
        .where(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.otp_hash == hash_token(otp),
            PasswordResetOtp.used_at.is_(None),
            PasswordResetOtp.expires_at > datetime.now(UTC),
        )
        .order_by(PasswordResetOtp.created_at.desc())
    )
    otp_record = db.scalars(stmt).first()
    if otp_record is None:
        return None

    reset_token = token_urlsafe(32)
    otp_record.reset_token_hash = hash_token(reset_token)
    otp_record.verified_at = datetime.now(UTC)
    db.commit()
    return reset_token


def change_password_with_reset_token(db: Session, user: User, reset_token: str, new_password: str) -> bool:
    stmt = (
        select(PasswordResetOtp)
        .where(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.reset_token_hash == hash_token(reset_token),
            PasswordResetOtp.verified_at.is_not(None),
            PasswordResetOtp.used_at.is_(None),
            PasswordResetOtp.expires_at > datetime.now(UTC),
        )
        .order_by(PasswordResetOtp.created_at.desc())
    )
    otp_record = db.scalars(stmt).first()
    if otp_record is None:
        return False

    user.password_hash = hash_password(new_password)
    otp_record.used_at = datetime.now(UTC)
    db.commit()
    return True


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

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from src.models.audit_log import AuditLog
from src.models.user import User
from src.models.user_session import UserSession


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    stmt = (
        select(User)
        .options(selectinload(User.role))
        .where(User.email == email.lower().strip(), User.status == "ACTIVE")
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


def write_audit_log(
    db: Session,
    action: str,
    user: User | None,
    details: dict | None,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            target_type="USER",
            target_id=str(user.id) if user else None,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    db.commit()

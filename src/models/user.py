import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.organization import Organization, organization_fk
from src.models.role import Role
from src.services.crypto import EncryptedText


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("organization_id", "employee_code", name="uq_users_org_employee_code"),
        # CCCD lưu mã hóa (mỗi lần mã hóa ra chuỗi khác) nên kiểm tra trùng bằng dấu vân tay citizen_id_hash.
        UniqueConstraint("organization_id", "citizen_id_hash", name="uq_users_org_citizen_id_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = organization_fk(nullable=True)
    public_id: Mapped[int | None] = mapped_column(Integer, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    department: Mapped[str | None] = mapped_column(String(100))
    employee_code: Mapped[str | None] = mapped_column(String(50))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    address: Mapped[str | None] = mapped_column(EncryptedText)
    citizen_id: Mapped[str | None] = mapped_column(EncryptedText)
    citizen_id_hash: Mapped[str | None] = mapped_column(String(64))
    phone: Mapped[str | None] = mapped_column(String(20))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Phiên bản điều khoản/chính sách đã đồng ý (src.services.legal.TERMS_VERSION) và thời điểm đồng ý.
    terms_version: Mapped[str | None] = mapped_column(String(20))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Xác thực hai lớp (TOTP). Khóa lưu mã hóa; có khóa mà chưa có totp_enabled_at là đang cài đặt dở.
    totp_secret: Mapped[str | None] = mapped_column(EncryptedText)
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bước thời gian (30 giây) của mã đã dùng gần nhất: không cho dùng lại một mã.
    totp_last_step: Mapped[int | None] = mapped_column(BigInteger)
    # Hash bcrypt của các mã khôi phục chưa dùng (mỗi mã dùng một lần).
    totp_recovery_codes: Mapped[list | None] = mapped_column(postgresql.JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    role: Mapped[Role] = relationship(back_populates="users")
    # NULL với admin nền tảng (không thuộc công ty nào).
    organization: Mapped[Organization | None] = relationship()

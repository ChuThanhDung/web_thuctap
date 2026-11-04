import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base

# Công ty mặc định: dữ liệu có trước khi hệ thống hỗ trợ nhiều công ty được gán vào đây (migration 0003),
# và tài khoản seed cũng thuộc công ty này.
DEMO_ORGANIZATION_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

# Cột organization_id tự lấy công ty của phiên làm việc (đặt bởi src.database.set_organization_context),
# nên code tạo bản ghi không phải truyền công ty; thiếu ngữ cảnh thì giá trị là NULL và bị NOT NULL chặn lại.
CURRENT_ORGANIZATION_DEFAULT = text("nullif(current_setting('app.current_org', true), '')::uuid")


def organization_fk(nullable: bool = False) -> Mapped[uuid.UUID]:
    return mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=nullable,
        index=True,
        server_default=CURRENT_ORGANIZATION_DEFAULT,
    )


class Organization(Base):
    """Một công ty khách hàng. Mọi dữ liệu nghiệp vụ thuộc đúng một công ty và được cách ly bằng Row-Level Security."""

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tax_id: Mapped[str | None] = mapped_column(String(20))
    plan: Mapped[str] = mapped_column(String(20), nullable=False, server_default="free")
    # active | suspended
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Hạn của gói đã trả tiền; NULL = không hết hạn (gói free, hoặc admin cấp không thời hạn).
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # False: chỉ nhận XML (đọc trên máy chủ), không gửi PDF/ảnh tới dịch vụ AI ở nước ngoài.
    ai_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), default=True)
    # Yêu cầu xóa công ty: thực hiện sau 30 ngày (scripts/process_company_deletions.py), hủy được trước đó.
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_requested_by: Mapped[uuid.UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

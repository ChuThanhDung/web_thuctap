import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.organization import CURRENT_ORGANIZATION_DEFAULT, organization_fk


class UsageCounter(Base):
    """Mức dùng của một công ty trong một tháng (giờ Việt Nam). Chỉ tăng, kể cả khi xóa bộ, để xóa rồi tạo lại không
    lách được hạn mức."""

    __tablename__ = "usage_counters"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        primary_key=True,
        server_default=CURRENT_ORGANIZATION_DEFAULT,
    )
    # Tháng dạng 'YYYY-MM'.
    period: Mapped[str] = mapped_column(String(7), primary_key=True)
    batches_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ai_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Số lần trợ lý AI gọi mô hình (xếp bộ, điều tra, soạn thư, hỏi đáp).
    agent_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Payment(Base):
    """Một lần nâng cấp/gia hạn gói: tạo khi khách bấm thanh toán, chuyển 'paid' khi SePay báo tiền về."""

    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = organization_fk()
    # Mã ghi trong nội dung chuyển khoản, ví dụ DSA7K3Q9X2M. Duy nhất toàn hệ thống.
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # pending | paid | expired
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_amount: Mapped[int | None] = mapped_column(BigInteger)
    # Mã giao dịch phía SePay: chống xử lý một giao dịch hai lần khi webhook gửi lại.
    provider_transaction_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    provider_reference: Mapped[str | None] = mapped_column(String(100))
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.user import User


class ReconciliationCase(Base):
    __tablename__ = "reconciliation_cases"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)

    # Số hiệu 3 chứng từ
    invoice_number: Mapped[str | None] = mapped_column(String(50))
    po_number: Mapped[str | None] = mapped_column(String(50))
    grn_number: Mapped[str | None] = mapped_column(String(50))

    # Nhà cung cấp
    partner_name: Mapped[str | None] = mapped_column(String(255))
    partner_tax_id: Mapped[str | None] = mapped_column(String(20))

    # Ngày & tổng tiền
    case_date: Mapped[date | None] = mapped_column(Date)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    # Trạng thái đối soát
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="matched")
    # matched | minor_diff | major_diff | low_confidence
    risk_level: Mapped[str] = mapped_column(String(10), nullable=False, default="low")
    # low | medium | high
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))

    # Kết quả AI
    ai_note: Mapped[str | None] = mapped_column(Text)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_recommendation: Mapped[str | None] = mapped_column(Text)

    # Chênh lệch
    diff_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    diff_type: Mapped[str | None] = mapped_column(String(20))
    # MATCH | MISMATCH_QTY | MISMATCH_PRICE | MISMATCH_TAX

    # Xử lý & phê duyệt
    processed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision: Mapped[str | None] = mapped_column(String(20))
    # approved | rejected | escalated
    rejection_note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    line_items: Mapped[list["LineItem"]] = relationship(
        back_populates="case", cascade="all, delete-orphan", order_by="LineItem.row_index"
    )
    processed_by: Mapped[User | None] = relationship(
        foreign_keys=[processed_by_id]
    )


class LineItem(Base):
    __tablename__ = "line_items"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("reconciliation_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Thông tin hàng hóa
    item_sku: Mapped[str | None] = mapped_column(String(50))
    item_name: Mapped[str | None] = mapped_column(String(255))
    unit: Mapped[str | None] = mapped_column(String(20))

    # Số lượng từ 3 nguồn
    inv_qty: Mapped[Decimal | None] = mapped_column(Numeric(15, 4))
    po_qty: Mapped[Decimal | None] = mapped_column(Numeric(15, 4))
    grn_qty: Mapped[Decimal | None] = mapped_column(Numeric(15, 4))

    # Đơn giá
    inv_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    po_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    # Thuế
    vat_rate_pct: Mapped[int | None] = mapped_column(Integer)

    # Kết quả đối chiếu
    diff_type: Mapped[str | None] = mapped_column(String(20))
    # MATCH | QTY_DIFF | PRICE_DIFF | TAX_DIFF
    diff_note: Mapped[str | None] = mapped_column(Text)

    # Relationship
    case: Mapped["ReconciliationCase"] = relationship(back_populates="line_items")


class Threshold(Base):
    __tablename__ = "thresholds"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    percent_threshold: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    absolute_threshold: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)

    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("document_batches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    uploaded_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.public_id", ondelete="SET NULL"), nullable=True
    )
    doc_type: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=text("date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))"),
    )

    uploaded_by: Mapped[User | None] = relationship()
    batch: Mapped["DocumentBatch | None"] = relationship(back_populates="files")
    ai_extraction: Mapped["UploadedDocumentExtraction | None"] = relationship(
        back_populates="upload",
        cascade="all, delete-orphan",
        uselist=False,
    )


class UploadedDocumentExtraction(Base):
    __tablename__ = "uploaded_document_extractions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    upload_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("uploaded_files.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    batch_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("document_batches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    expected_doc_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    detected_doc_type: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    is_correct_type: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="validated", index=True)
    validation_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(postgresql.JSONB, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(postgresql.JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=text("date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=text("date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))"),
        onupdate=func.now(),
    )

    upload: Mapped["UploadedFile"] = relationship(back_populates="ai_extraction")


class DocumentBatch(Base):
    __tablename__ = "document_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.public_id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="incomplete")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=text("date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=text("date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))"),
        onupdate=func.now(),
    )

    created_by: Mapped[User | None] = relationship()
    files: Mapped[list["UploadedFile"]] = relationship(
        back_populates="batch",
        order_by="UploadedFile.created_at.desc()",
    )


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255))
    supplier_tax_id: Mapped[str | None] = mapped_column(String(20))
    buyer_name: Mapped[str | None] = mapped_column(String(255))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["PurchaseOrderItem"]] = relationship(back_populates="po", cascade="all, delete-orphan")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id: Mapped[uuid.UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_sku: Mapped[str | None] = mapped_column(String(50))
    item_name: Mapped[str | None] = mapped_column(String(255))
    unit: Mapped[str | None] = mapped_column(String(20))
    qty: Mapped[Decimal | None] = mapped_column(Numeric(15, 4))
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    po: Mapped["PurchaseOrder"] = relationship(back_populates="items")


class GoodsReceiptNote(Base):
    __tablename__ = "goods_receipt_notes"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grn_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    po_number: Mapped[str | None] = mapped_column(String(50), index=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255))
    supplier_tax_id: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["GoodsReceiptNoteItem"]] = relationship(back_populates="grn", cascade="all, delete-orphan")


class GoodsReceiptNoteItem(Base):
    __tablename__ = "goods_receipt_note_items"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grn_id: Mapped[uuid.UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("goods_receipt_notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_sku: Mapped[str | None] = mapped_column(String(50))
    item_name: Mapped[str | None] = mapped_column(String(255))
    unit: Mapped[str | None] = mapped_column(String(20))
    qty: Mapped[Decimal | None] = mapped_column(Numeric(15, 4))

    grn: Mapped["GoodsReceiptNote"] = relationship(back_populates="items")

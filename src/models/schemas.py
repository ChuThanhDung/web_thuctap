"""
src/models/schemas.py — Pydantic schemas cho toàn bộ dự án
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

# ══════════════════════════════════════════════════════════════════════════════
# AUTH SCHEMAS (giữ nguyên)
# ══════════════════════════════════════════════════════════════════════════════


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class AuthUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    role_name: str
    department: str | None = None
    employee_code: str | None = None
    date_of_birth: date | None = None
    address: str | None = None
    citizen_id: str | None = None
    phone: str | None = None
    avatar_url: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    date_of_birth: date | None = None
    address: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)


class OtpRequestResponse(BaseModel):
    message: str
    expires_in_seconds: int
    resend_after_seconds: int


class PasswordChangeInitiateRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)


class OtpVerifyRequest(BaseModel):
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class UserCreateRequest(BaseModel):
    email: EmailStr = Field(..., description="Email phải đúng định dạng hợp lệ")
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)
    role_code: str = Field(..., description="'chief_accountant' hoặc 'accountant'")
    department: str | None = Field(default=None, max_length=100)
    employee_code: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=20)


class UserListResponse(BaseModel):
    items: list[AuthUser]
    total: int


class MessageResponse(BaseModel):
    message: str


# ══════════════════════════════════════════════════════════════════════════════
# RECONCILIATION SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class LineItemOut(BaseModel):
    id: str
    row_index: int
    item_sku: str | None
    item_name: str | None
    unit: str | None
    inv_qty: Decimal | None
    po_qty: Decimal | None
    grn_qty: Decimal | None
    inv_unit_price: Decimal | None
    po_unit_price: Decimal | None
    vat_rate_pct: int | None
    diff_type: str | None
    diff_note: str | None

    model_config = {"from_attributes": True}


class ReconciliationListItem(BaseModel):
    """Schema gọn cho danh sách."""

    id: str
    case_number: str
    invoice_number: str | None
    po_number: str | None
    grn_number: str | None
    partner_name: str | None
    case_date: date | None
    total_amount: Decimal | None
    status: str
    risk_level: str
    confidence: Decimal | None
    diff_amount: Decimal | None
    diff_type: str | None
    ai_note: str | None
    decision: str | None
    processed_by_name: str | None = None
    processed_at: datetime | None

    model_config = {"from_attributes": True}


class CaseDetailOut(BaseModel):
    """Schema đầy đủ cho trang chi tiết."""

    id: str
    case_number: str
    invoice_number: str | None
    po_number: str | None
    grn_number: str | None
    partner_name: str | None
    partner_tax_id: str | None
    case_date: date | None
    total_amount: Decimal | None
    status: str
    risk_level: str
    confidence: Decimal | None
    diff_amount: Decimal | None
    diff_type: str | None
    ai_note: str | None
    ai_summary: str | None
    ai_recommendation: str | None
    decision: str | None
    rejection_note: str | None
    processed_by_name: str | None = None
    processed_at: datetime | None
    line_items: list[LineItemOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReconciliationListResponse(BaseModel):
    items: list[ReconciliationListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class CaseDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approved|rejected|escalated)$")
    note: str | None = Field(default=None, max_length=1000)


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class DashboardStatsOut(BaseModel):
    total_cases: int
    total_matched: int
    total_pending: int
    total_escalated: int
    total_value: Decimal
    pending_value: Decimal
    match_rate: float  # %
    cases_by_status: dict[str, int]
    cases_by_risk: dict[str, int]


# ══════════════════════════════════════════════════════════════════════════════
# AUDIT LOG SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class AuditLogOut(BaseModel):
    id: int
    user_id: str | None
    user_name: str | None = None
    action: str
    target_type: str | None
    target_id: str | None
    details: dict | None
    ip_address: str | None
    created_at: datetime
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ══════════════════════════════════════════════════════════════════════════════
# THRESHOLD SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class ThresholdOut(BaseModel):
    id: str
    category: str
    percent_threshold: Decimal
    absolute_threshold: Decimal
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class ThresholdUpdateRequest(BaseModel):
    category: str | None = Field(default=None, min_length=2, max_length=100)
    percent_threshold: Decimal = Field(..., ge=0, le=100)
    absolute_threshold: Decimal = Field(..., ge=0)


class ThresholdCreateRequest(BaseModel):
    category: str = Field(..., min_length=2, max_length=100)
    percent_threshold: Decimal = Field(..., ge=0, le=100)
    absolute_threshold: Decimal = Field(..., ge=0)


# ══════════════════════════════════════════════════════════════════════════════
# UPLOAD SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class UploadedDocumentExtractionOut(BaseModel):
    id: int
    expected_doc_type: str
    detected_doc_type: str | None = None
    is_correct_type: bool
    confidence: Decimal | None = None
    status: str
    validation_message: str | None = None
    model_name: str | None = None
    extracted_data: dict | None = None
    created_at: str
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class UploadedFileOut(BaseModel):
    id: int
    batch_id: int | None = None
    doc_type: str | None = None
    uploaded_by_id: int | None = None
    uploaded_by_name: str | None = None
    filename: str
    original_filename: str | None = None
    stored_filename: str | None = None
    storage_provider: str | None = None
    storage_key: str | None = None
    file_url: str | None = None
    content_type: str | None = None
    file_ext: str | None = None
    size: str
    status: str
    progress: int
    error_message: str | None
    case_id: str | None
    ai_extraction: UploadedDocumentExtractionOut | None = None
    created_at: str

    model_config = {"from_attributes": True}


class UploadedFileListResponse(BaseModel):
    items: list[UploadedFileOut]
    total: int


class DocumentBatchOut(BaseModel):
    id: int
    batch_number: str
    note: str | None = None
    rejection_note: str | None = None
    status: str
    created_by_id: int | None = None
    created_by_name: str | None = None
    approved_by_id: int | None = None
    approved_by_name: str | None = None
    chief_approved_by_id: int | None = None
    chief_approved_by_name: str | None = None
    files: list[UploadedFileOut] = []
    missing_doc_types: list[str] = []
    uploaded_doc_types: list[str] = []
    extracted_doc_types: list[str] = []
    pending_extraction_doc_types: list[str] = []
    created_at: str
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class DocumentBatchListResponse(BaseModel):
    items: list[DocumentBatchOut]
    total: int


class DocumentBatchUpdateRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class DocumentBatchRejectRequest(BaseModel):
    rejection_note: str = Field(..., min_length=1, max_length=1000)

"""
src/models/schemas.py — Pydantic schemas cho toàn bộ dự án
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

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


class OrganizationSummary(BaseModel):
    """Công ty của người dùng, hiện ở giao diện (tên, gói đang dùng, hạn dùng thử)."""

    id: str
    name: str
    plan: str
    effective_plan: str
    trial_ends_at: datetime | None = None
    plan_expires_at: datetime | None = None
    status: str


class AuthUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    role_name: str
    status: str = "ACTIVE"
    department: str | None = None
    employee_code: str | None = None
    date_of_birth: date | None = None
    address: str | None = None
    citizen_id: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    organization: OrganizationSummary | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


PASSWORD_MIN_LENGTH = 8
COMMON_WEAK_PASSWORDS = {"123456", "12345678", "123456789", "password", "password1", "admin123", "qwerty123", "11111111"}


def validate_password_strength(value: str) -> str:
    """Chính sách mật khẩu: tối thiểu 8 ký tự, có cả chữ và số, không thuộc danh sách mật khẩu phổ biến."""
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Mật khẩu phải có tối thiểu {PASSWORD_MIN_LENGTH} ký tự.")
    if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
        raise ValueError("Mật khẩu phải gồm cả chữ và số.")
    if value.lower() in COMMON_WEAK_PASSWORDS:
        raise ValueError("Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác.")
    return value


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

    @field_validator("new_password")
    @classmethod
    def new_password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)


class OtpVerifyRequest(BaseModel):
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class UserCreateRequest(BaseModel):
    email: EmailStr = Field(..., description="Email phải đúng định dạng hợp lệ")
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)
    role_code: str = Field(..., pattern="^(chief_accountant|accountant)$")
    department: str | None = Field(default="Phòng Kế toán - Tài chính", max_length=100)
    employee_code: str | None = Field(default=None, max_length=50)
    phone: str = Field(..., pattern=r"^\d{10}$")
    citizen_id: str = Field(..., pattern=r"^\d{12}$")
    address: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date | None = None

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)


class UserUpdateRequest(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    role_code: str | None = Field(default=None, pattern="^(chief_accountant|accountant)$")
    department: str | None = Field(default=None, max_length=100)
    employee_code: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, pattern=r"^\d{10}$")
    citizen_id: str | None = Field(default=None, pattern=r"^\d{12}$")
    address: str | None = Field(default=None, min_length=1, max_length=255)
    date_of_birth: date | None = None


class UserListResponse(BaseModel):
    items: list[AuthUser]
    total: int


class MessageResponse(BaseModel):
    message: str


# ══════════════════════════════════════════════════════════════════════════════
# SIGNUP / INVITATION / PLATFORM ADMIN SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class SignupRequestIn(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=255)
    tax_id: str | None = Field(default=None, pattern=r"^\d{10}(-\d{3})?$")
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    accept_terms: bool

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("accept_terms")
    @classmethod
    def terms_accepted(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Bạn cần đồng ý với điều khoản sử dụng.")
        return value

    @field_validator("tax_id", mode="before")
    @classmethod
    def empty_tax_id_is_none(cls, value):
        return value.strip() or None if isinstance(value, str) else value


class SignupStartResponse(BaseModel):
    signup_id: str
    email: str
    expires_in_seconds: int
    resend_after_seconds: int


class SignupVerifyRequest(BaseModel):
    signup_id: uuid.UUID
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class SignupResendRequest(BaseModel):
    signup_id: uuid.UUID


class InvitationCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    role_code: str = Field(default="accountant", pattern="^(chief_accountant|accountant)$")


class InvitationOut(BaseModel):
    id: str
    email: str
    full_name: str
    role_code: str
    expires_at: datetime
    created_at: datetime | None = None
    # Chỉ có ngay khi vừa tạo: link để kế toán trưởng tự gửi nếu email không tới.
    accept_url: str | None = None


class InvitationLookupResponse(BaseModel):
    email: str
    full_name: str
    role_code: str
    organization_name: str
    expires_at: datetime


class InvitationAcceptRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)


class AdminOrganizationRow(BaseModel):
    id: str
    name: str
    tax_id: str | None
    plan: str
    effective_plan: str
    status: str
    trial_ends_at: datetime | None
    plan_expires_at: datetime | None = None
    created_at: datetime | None
    user_count: int
    batch_count: int
    batches_this_month: int
    files_this_month: int
    last_activity_at: datetime | None
    owner_email: str | None


class AdminOrganizationList(BaseModel):
    items: list[AdminOrganizationRow]
    total: int


class AdminOrganizationUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: str
    last_login_at: datetime | None


class AdminOrganizationDetail(AdminOrganizationRow):
    users: list[AdminOrganizationUser]


class AdminOrganizationUpdate(BaseModel):
    plan: str | None = Field(default=None, pattern="^(free|pro|ultra)$")
    status: str | None = Field(default=None, pattern="^(active|suspended)$")
    # Số ngày dùng thử tính từ hôm nay; 0 = kết thúc dùng thử ngay.
    trial_days: int | None = Field(default=None, ge=0, le=90)
    # Khi đổi gói: số ngày hiệu lực tính từ hôm nay; bỏ trống = không hết hạn (cấp tay, ví dụ khách trả ngoài hệ thống).
    plan_days: int | None = Field(default=None, ge=1, le=3660)


class AdminOverview(BaseModel):
    organizations: int
    active_organizations: int
    suspended_organizations: int
    in_trial: int
    by_plan: dict[str, int]
    users: int
    signups_last_30_days: int
    batches_this_month: int
    files_this_month: int
    # Doanh thu (đ) từ các đơn đã thanh toán.
    revenue_this_month: int = 0
    revenue_total: int = 0


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
    version: int = 1
    created_at: str

    model_config = {"from_attributes": True}


class UploadedFileListResponse(BaseModel):
    items: list[UploadedFileOut]
    total: int


class DocumentBatchHistoryOut(BaseModel):
    id: int
    batch_id: int
    version: int
    status: str
    rejection_note: str | None = None
    rejected_by_name: str | None = None
    rejected_at: str | None = None
    files: list[UploadedFileOut] = []
    note: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class DocumentBatchOut(BaseModel):
    id: int
    batch_number: str
    version: int = 1
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
    history: list[DocumentBatchHistoryOut] = []
    missing_doc_types: list[str] = []
    uploaded_doc_types: list[str] = []
    extracted_doc_types: list[str] = []
    pending_extraction_doc_types: list[str] = []
    reconciliation_status: str | None = None
    reconciliation_diff_type: str | None = None
    reconciliation_diff_amount: Decimal | None = None
    reconciliation_ai_note: str | None = None
    reconciliation_ai_summary: str | None = None
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


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    message: str
    batch_id: int | None = None
    action_url: str | None = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    unread_count: int


# ══════════════════════════════════════════════════════════════════════════════
# BILLING SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════


class PlanOut(BaseModel):
    code: str
    name: str
    monthly_price: int
    yearly_price: int
    users: int | None
    batches_per_month: int
    ai_files_per_month: int
    storage_bytes: int
    retention_months: int
    support: str


class UsageOut(BaseModel):
    period: str
    users: int
    batches: int
    ai_files: int
    storage_bytes: int


class BillingOverview(BaseModel):
    organization: OrganizationSummary
    limits: PlanOut
    usage: UsageOut
    plans: list[PlanOut]
    billing_enabled: bool


class CheckoutRequest(BaseModel):
    plan: str = Field(..., pattern="^(pro|ultra)$")
    months: int = Field(..., description="1 hoặc 12 tháng")

    @field_validator("months")
    @classmethod
    def months_supported(cls, value: int) -> int:
        if value not in (1, 12):
            raise ValueError("Kỳ hạn chỉ có 1 tháng hoặc 12 tháng.")
        return value


class BankTransferOut(BaseModel):
    bank_code: str
    account_number: str
    account_name: str
    amount: int
    content: str
    qr_url: str


class PaymentOut(BaseModel):
    id: str
    code: str
    plan: str
    months: int
    amount: int
    status: str
    created_at: datetime | None
    expires_at: datetime
    paid_at: datetime | None
    period_end: datetime | None
    transfer: BankTransferOut | None = None

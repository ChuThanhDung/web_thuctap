"""Thao tác trên công ty khách hàng dùng chung cho seed, đăng ký và trang quản trị nền tảng."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from src.models.organization import Organization
from src.models.reconciliation import Threshold

# Ngưỡng mặc định của mỗi công ty mới (đúng quy tắc trong PRODUCT.md): số tiền lệch tối đa 1.000 đ do làm tròn,
# số lượng phải khớp tuyệt đối. Công ty tự chỉnh ở trang Ngưỡng sai số.
DEFAULT_THRESHOLDS = (
    {"category": "Đơn giá & Tổng tiền", "percent_threshold": "0", "absolute_threshold": "1000"},
    {"category": "Số lượng", "percent_threshold": "0", "absolute_threshold": "0"},
)


def ensure_default_thresholds(db: Session, organization_id: uuid.UUID) -> None:
    """Tạo bộ ngưỡng mặc định cho công ty nếu còn thiếu loại nào. Không commit."""
    existing = {
        category
        for (category,) in db.query(Threshold.category).filter(Threshold.organization_id == organization_id).all()
    }
    for data in DEFAULT_THRESHOLDS:
        if data["category"] not in existing:
            db.add(Threshold(organization_id=organization_id, **data))


# --- Gói dịch vụ ---------------------------------------------------------------------------------------------------
# plan là gói công ty đã trả tiền (mặc định free), có hạn tới plan_expires_at (NULL = không hết hạn, ví dụ admin cấp
# tay). Trong thời gian dùng thử (trial_ends_at chưa qua), công ty dùng gói Pro. Hết hạn thì tự về gói thấp hơn lúc
# đọc, không cần tác vụ nền và không xóa dữ liệu.

PLANS = ("free", "pro", "ultra")
PLAN_NAMES = {"free": "Free", "pro": "Pro", "ultra": "Ultra"}
TRIAL_PLAN = "pro"
TRIAL_DAYS = 14


def is_in_trial(organization: Organization, now: datetime | None = None) -> bool:
    return organization.trial_ends_at is not None and (now or datetime.now(UTC)) < organization.trial_ends_at


def paid_plan(organization: Organization, now: datetime | None = None) -> str:
    """Gói đã trả tiền còn hạn; hết hạn thì là free."""
    expires_at = organization.plan_expires_at
    if expires_at is not None and (now or datetime.now(UTC)) >= expires_at:
        return "free"
    return organization.plan


def effective_plan(organization: Organization, now: datetime | None = None) -> str:
    plan = paid_plan(organization, now)
    if is_in_trial(organization, now) and PLANS.index(TRIAL_PLAN) > PLANS.index(plan):
        return TRIAL_PLAN
    return plan


def create_organization(db: Session, name: str, tax_id: str | None = None) -> Organization:
    """Tạo công ty mới đang dùng thử gói Pro, kèm bộ ngưỡng mặc định. Không commit.

    Phiên phải ở chế độ hệ thống (công ty chưa tồn tại thì chưa có ngữ cảnh công ty).
    """
    organization = Organization(
        id=uuid.uuid4(),
        name=name,
        tax_id=tax_id,
        plan="free",
        status="active",
        trial_ends_at=datetime.now(UTC) + timedelta(days=TRIAL_DAYS),
    )
    db.add(organization)
    db.flush()
    ensure_default_thresholds(db, organization.id)
    return organization

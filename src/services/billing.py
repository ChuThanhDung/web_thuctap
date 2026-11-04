"""Thu tiền bằng chuyển khoản qua SePay (VietQR).

Luồng: kế toán trưởng chọn gói → tạo đơn `payments` có mã riêng (ví dụ DSA7K3Q9X2M) → khách quét QR, nội dung chuyển
khoản là mã đơn → SePay gọi webhook khi tiền về → tìm đơn theo mã, đủ tiền thì kích hoạt hoặc gia hạn gói.

Webhook có thể gửi lại cùng một giao dịch: mã giao dịch SePay là duy nhất nên mỗi giao dịch chỉ được xử lý một lần.
"""

import logging
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.billing import Payment
from src.models.organization import Organization
from src.models.role import Role
from src.models.user import User
from src.services.email import send_payment_confirmed_email
from src.services.organizations import PLAN_NAMES, paid_plan
from src.services.plans import BILLING_PERIODS, price_for

logger = logging.getLogger(__name__)

PAID_PLANS = ("pro", "ultra")
# Mã đơn: tiền tố + 8 ký tự dễ đọc (bỏ 0/O/1/I để khách gõ tay không nhầm).
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 8
MONTH = timedelta(days=30)


class BillingError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class BankTransfer:
    bank_code: str
    account_number: str
    account_name: str
    amount: int
    content: str
    qr_url: str


def is_billing_enabled() -> bool:
    settings = get_settings()
    return bool(settings.sepay_bank_code and settings.sepay_bank_account)


def _new_code() -> str:
    prefix = get_settings().payment_code_prefix
    return prefix + "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def bank_transfer_for(payment: Payment) -> BankTransfer:
    settings = get_settings()
    query = urlencode(
        {
            "acc": settings.sepay_bank_account,
            "bank": settings.sepay_bank_code,
            "amount": payment.amount,
            "des": payment.code,
        }
    )
    return BankTransfer(
        bank_code=settings.sepay_bank_code,
        account_number=settings.sepay_bank_account,
        account_name=settings.sepay_account_name,
        amount=payment.amount,
        content=payment.code,
        qr_url=f"https://qr.sepay.vn/img?{query}",
    )


def create_payment(db: Session, user: User, *, plan: str, months: int) -> Payment:
    """Tạo đơn chờ thanh toán trong công ty của người dùng. Đơn cũ còn chờ của cùng gói và kỳ hạn được dùng lại."""
    if not is_billing_enabled():
        raise BillingError("Chưa bật thanh toán trực tuyến. Vui lòng liên hệ để nâng cấp gói.", status_code=503)
    if plan not in PAID_PLANS or months not in BILLING_PERIODS:
        raise BillingError("Gói hoặc kỳ hạn không hợp lệ.")

    now = datetime.now(UTC)
    existing = db.scalars(
        select(Payment)
        .where(Payment.status == "pending", Payment.plan == plan, Payment.months == months, Payment.expires_at > now)
        .order_by(Payment.created_at.desc())
    ).first()
    if existing is not None and existing.amount == price_for(plan, months):
        return existing

    for _ in range(5):
        code = _new_code()
        if db.scalar(select(func.count(Payment.id)).where(Payment.code == code)) == 0:
            break
    payment = Payment(
        id=uuid.uuid4(),
        organization_id=user.organization_id,
        code=code,
        plan=plan,
        months=months,
        amount=price_for(plan, months),
        status="pending",
        created_by_id=user.id,
        expires_at=now + timedelta(hours=get_settings().payment_ttl_hours),
    )
    db.add(payment)
    db.commit()
    return payment


def list_payments(db: Session, limit: int = 50) -> list[Payment]:
    """Đơn của công ty hiện tại (RLS giới hạn), mới nhất trước. Đơn chờ đã quá hạn hiện là 'expired'."""
    now = datetime.now(UTC)
    payments = db.scalars(select(Payment).order_by(Payment.created_at.desc()).limit(limit)).all()
    changed = False
    for payment in payments:
        if payment.status == "pending" and payment.expires_at <= now:
            payment.status = "expired"
            changed = True
    if changed:
        db.commit()
    return payments


def activate_plan(organization: Organization, plan: str, months: int, now: datetime) -> tuple[datetime, datetime]:
    """Gia hạn nếu đang dùng đúng gói đó và còn hạn; đổi gói thì tính từ hôm nay. Trả về (bắt đầu, kết thúc)."""
    current = paid_plan(organization, now)
    if current == plan and organization.plan_expires_at and organization.plan_expires_at > now:
        start = organization.plan_expires_at
    else:
        start = now
    end = start + MONTH * months
    organization.plan = plan
    organization.plan_expires_at = end
    return start, end


# --- Webhook SePay ------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class WebhookResult:
    status: str
    payment: Payment | None = None


def extract_payment_code(*texts: str | None) -> str | None:
    prefix = re.escape(get_settings().payment_code_prefix)
    pattern = re.compile(rf"{prefix}[{CODE_ALPHABET}]{{{CODE_LENGTH}}}")
    for value in texts:
        if value:
            match = pattern.search(value.upper().replace(" ", ""))
            if match:
                return match.group(0)
    return None


def handle_sepay_webhook(db: Session, payload: dict) -> WebhookResult:
    """Xử lý một giao dịch SePay gửi về. Phiên ở chế độ hệ thống (không có người đăng nhập)."""
    if payload.get("transferType") != "in":
        return WebhookResult("ignored_outgoing")
    transaction_id = str(payload.get("id") or "").strip()
    if not transaction_id:
        return WebhookResult("ignored_no_id")
    if db.scalar(select(func.count(Payment.id)).where(Payment.provider_transaction_id == transaction_id)):
        return WebhookResult("duplicate")

    code = extract_payment_code(payload.get("code"), payload.get("content"), payload.get("description"))
    if code is None:
        logger.info("Giao dịch SePay %s không có mã đơn DocuSync, bỏ qua.", transaction_id)
        return WebhookResult("ignored_no_code")

    payment = db.scalars(select(Payment).where(Payment.code == code).with_for_update()).first()
    if payment is None:
        logger.warning("Giao dịch SePay %s có mã %s nhưng không có đơn tương ứng.", transaction_id, code)
        return WebhookResult("unknown_code")
    if payment.status == "paid":
        logger.warning(
            "Đơn %s đã thanh toán; giao dịch SePay %s chuyển thêm, cần hoàn tiền thủ công.", code, transaction_id
        )
        return WebhookResult("already_paid", payment)

    amount = int(payload.get("transferAmount") or 0)
    if amount < payment.amount:
        logger.warning("Đơn %s chuyển thiếu: %s / %s đ (giao dịch %s).", code, amount, payment.amount, transaction_id)
        return WebhookResult("underpaid", payment)

    now = datetime.now(UTC)
    organization = db.get(Organization, payment.organization_id)
    start, end = activate_plan(organization, payment.plan, payment.months, now)
    # Khách chuyển sau khi đơn quá hạn vẫn được kích hoạt: tiền đã về thì phải giao dịch vụ.
    payment.status = "paid"
    payment.paid_at = now
    payment.paid_amount = amount
    payment.provider_transaction_id = transaction_id
    payment.provider_reference = str(payload.get("referenceCode") or "")[:100] or None
    payment.period_start = start
    payment.period_end = end
    db.commit()

    for email in chief_emails(db, organization.id):
        send_payment_confirmed_email(email, organization.name, PLAN_NAMES[payment.plan], amount, end)
    return WebhookResult("paid", payment)


def chief_emails(db: Session, organization_id: uuid.UUID) -> list[str]:
    return list(
        db.scalars(
            select(User.email)
            .join(Role, Role.id == User.role_id)
            .where(
                User.organization_id == organization_id,
                Role.code == "chief_accountant",
                func.upper(User.status) == "ACTIVE",
            )
        ).all()
    )

"""Gói dịch vụ, mức dùng và thanh toán (SePay)."""

import hmac
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from src.api.auth import get_current_user, require_chief_accountant, to_organization_summary
from src.config import get_settings
from src.database import get_db
from src.models.billing import Payment
from src.models.schemas import (
    BankTransferOut,
    BillingOverview,
    CheckoutRequest,
    PaymentOut,
    PlanOut,
    UsageOut,
)
from src.models.user import User
from src.services.auth import write_audit_log
from src.services.billing import (
    BillingError,
    bank_transfer_for,
    create_payment,
    handle_sepay_webhook,
    is_billing_enabled,
    list_payments,
)
from src.services.organizations import PLAN_NAMES
from src.services.plans import PLAN_LIMITS, limits_for, price_for, usage_summary

router = APIRouter(prefix="/billing", tags=["billing"])


def to_plan_out(code: str) -> PlanOut:
    limits = PLAN_LIMITS[code]
    return PlanOut(
        code=code,
        name=PLAN_NAMES[code],
        monthly_price=limits.monthly_price,
        yearly_price=price_for(code, 12),
        users=limits.users,
        batches_per_month=limits.batches_per_month,
        ai_files_per_month=limits.ai_files_per_month,
        storage_bytes=limits.storage_bytes,
        retention_months=limits.retention_months,
        support=limits.support,
    )


def to_payment_out(payment: Payment, with_transfer: bool = False) -> PaymentOut:
    transfer = None
    if with_transfer and payment.status == "pending" and is_billing_enabled():
        transfer = BankTransferOut(**bank_transfer_for(payment).__dict__)
    return PaymentOut(
        id=str(payment.id),
        code=payment.code,
        plan=payment.plan,
        months=payment.months,
        amount=payment.amount,
        status=payment.status,
        created_at=payment.created_at,
        expires_at=payment.expires_at,
        paid_at=payment.paid_at,
        period_end=payment.period_end,
        transfer=transfer,
    )


@router.get("/plans", response_model=list[PlanOut])
async def public_plans() -> list[PlanOut]:
    """Bảng gói và hạn mức, công khai cho trang Bảng giá (cùng nguồn PLAN_LIMITS với phần chặn hạn mức)."""
    return [to_plan_out(code) for code in PLAN_LIMITS]


@router.get("/overview", response_model=BillingOverview)
async def billing_overview(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> BillingOverview:
    """Gói đang dùng, hạn mức và mức dùng tháng này. Mọi người trong công ty đều xem được."""
    organization = current_user.organization
    plan, _ = limits_for(organization)
    return BillingOverview(
        organization=to_organization_summary(organization),
        limits=to_plan_out(plan),
        usage=UsageOut(**usage_summary(db, organization)),
        plans=[to_plan_out(code) for code in PLAN_LIMITS],
        billing_enabled=is_billing_enabled(),
    )


@router.get("/payments", response_model=list[PaymentOut])
async def payment_history(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[PaymentOut]:
    require_chief_accountant(current_user)
    return [to_payment_out(payment) for payment in list_payments(db)]


@router.post("/checkout", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: CheckoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaymentOut:
    require_chief_accountant(current_user)
    try:
        payment = create_payment(db, current_user, plan=payload.plan, months=payload.months)
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    write_audit_log(
        db=db,
        action="PAYMENT_CREATED",
        user=current_user,
        target_type="PAYMENT",
        target_id=str(payment.id),
        details={"code": payment.code, "plan": payment.plan, "months": payment.months, "amount": payment.amount},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return to_payment_out(payment, with_transfer=True)


@router.get("/payments/{payment_id}", response_model=PaymentOut)
async def payment_status(
    payment_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PaymentOut:
    """Trạng thái một đơn (giao diện hỏi lại vài giây một lần trong lúc chờ chuyển khoản)."""
    require_chief_accountant(current_user)
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đơn thanh toán.")
    return to_payment_out(payment, with_transfer=True)


@router.post("/webhook")
async def sepay_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """SePay gọi khi tài khoản nhận tiền có giao dịch. Xác thực bằng header `Authorization: Apikey <khóa>`."""
    api_key = get_settings().sepay_webhook_api_key
    provided = (authorization or "").removeprefix("Apikey").strip()
    if not api_key or not hmac.compare_digest(provided.encode(), api_key.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai khóa webhook.")
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dữ liệu không phải JSON.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dữ liệu không hợp lệ.")

    result = handle_sepay_webhook(db, payload)
    if result.status == "paid":
        write_audit_log(
            db=db,
            action="PAYMENT_RECEIVED",
            user=None,
            target_type="PAYMENT",
            target_id=str(result.payment.id),
            details={"code": result.payment.code, "plan": result.payment.plan, "amount": result.payment.paid_amount},
            organization_id=result.payment.organization_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    # SePay gửi lại khi nhận mã khác 2xx, nên giao dịch không thuộc DocuSync vẫn trả 200.
    return {"success": True, "result": result.status}

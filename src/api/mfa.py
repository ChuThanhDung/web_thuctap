"""Xác thực hai lớp: bước hai của đăng nhập, cài đặt/tắt 2FA, mã khôi phục. Kèm xem đủ số CCCD (có ghi nhật ký)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from src.api.auth import finish_login, get_current_user, get_managed_user, require_chief_accountant, to_auth_user
from src.database import get_db
from src.models.schemas import (
    AuthUser,
    CitizenIdResponse,
    LoginResponse,
    MfaCodeRequest,
    MfaDisableRequest,
    MfaLoginRequest,
    MfaRecoveryCodesResponse,
    MfaSetupResponse,
)
from src.models.user import User
from src.services.auth import verify_password, write_audit_log
from src.services.mfa import (
    MfaError,
    complete_challenge,
    disable,
    enable,
    mfa_enabled,
    mfa_required,
    new_recovery_codes,
    start_setup,
    verify_second_factor,
)

router = APIRouter(prefix="/auth", tags=["mfa"])


def client(request: Request) -> tuple[str | None, str | None]:
    return (request.client.host if request.client else None), request.headers.get("user-agent")


def audit(db: Session, request: Request, action: str, user: User, **kwargs) -> None:
    ip_address, user_agent = client(request)
    write_audit_log(db=db, action=action, user=user, ip_address=ip_address, user_agent=user_agent, **kwargs)


def http_error(exc: MfaError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/login/mfa", response_model=LoginResponse)
async def login_second_step(payload: MfaLoginRequest, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    try:
        user, method = complete_challenge(db, payload.mfa_token, payload.code)
    except MfaError as exc:
        raise http_error(exc) from exc
    ip_address, user_agent = client(request)
    if method == "recovery_code":
        audit(db, request, "MFA_RECOVERY_CODE_USED", user, details={"remaining": len(user.totp_recovery_codes or [])})
    return finish_login(db, user, ip_address, user_agent, method=method)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
async def mfa_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MfaSetupResponse:
    try:
        secret, uri, qr = start_setup(current_user)
    except MfaError as exc:
        raise http_error(exc) from exc
    db.commit()
    return MfaSetupResponse(secret=secret, otpauth_uri=uri, qr_svg=qr)


@router.post("/mfa/enable", response_model=MfaRecoveryCodesResponse)
async def mfa_enable(
    payload: MfaCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MfaRecoveryCodesResponse:
    try:
        codes = enable(db, current_user, payload.code)
    except MfaError as exc:
        raise http_error(exc) from exc
    audit(db, request, "MFA_ENABLED", current_user, details={"email": current_user.email})
    return MfaRecoveryCodesResponse(recovery_codes=codes)


@router.post("/mfa/disable", response_model=AuthUser)
async def mfa_disable(
    payload: MfaDisableRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    if mfa_required(current_user):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Vai trò của bạn bắt buộc bật xác thực hai lớp."
        )
    if not mfa_enabled(current_user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Xác thực hai lớp đang tắt.")
    if not verify_password(payload.password, current_user.password_hash) or not verify_second_factor(
        current_user, payload.code
    ):
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hoặc mã xác thực không đúng.")
    disable(db, current_user)
    audit(db, request, "MFA_DISABLED", current_user, details={"email": current_user.email})
    return to_auth_user(current_user)


@router.post("/mfa/recovery-codes", response_model=MfaRecoveryCodesResponse)
async def mfa_new_recovery_codes(
    payload: MfaCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MfaRecoveryCodesResponse:
    """Tạo bộ mã khôi phục mới (bộ cũ hết hiệu lực). Cần mã 6 số hiện tại."""
    if not mfa_enabled(current_user) or verify_second_factor(current_user, payload.code) != "totp":
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mã xác thực không đúng.")
    codes = new_recovery_codes(current_user)
    db.commit()
    audit(db, request, "MFA_RECOVERY_CODES_REGENERATED", current_user, details={"email": current_user.email})
    return MfaRecoveryCodesResponse(recovery_codes=codes)


@router.post("/users/{user_id}/mfa/reset", response_model=AuthUser)
async def reset_user_mfa(
    user_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    """Kế toán trưởng tắt 2FA cho người trong công ty bị mất điện thoại; lần đăng nhập sau họ cài lại."""
    require_chief_accountant(current_user)
    target = get_managed_user(db, user_id)
    if target.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không tự đặt lại 2FA của mình được. Dùng mã khôi phục hoặc nhờ kế toán trưởng khác.",
        )
    disable(db, target)
    audit(
        db, request, "MFA_RESET_BY_CHIEF", current_user, target_type="USER", target_id=str(target.id),
        details={"target_email": target.email},
    )  # fmt: skip
    return to_auth_user(target)


@router.get("/users/{user_id}/citizen-id", response_model=CitizenIdResponse)
async def reveal_citizen_id(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CitizenIdResponse:
    """Số CCCD đầy đủ, chỉ kế toán trưởng trong cùng công ty. Mỗi lần xem được ghi nhật ký."""
    require_chief_accountant(current_user)
    target = get_managed_user(db, str(user_id))
    audit(
        db, request, "CITIZEN_ID_VIEWED", current_user, target_type="USER", target_id=str(target.id),
        details={"target_email": target.email},
    )  # fmt: skip
    return CitizenIdResponse(citizen_id=target.citizen_id)

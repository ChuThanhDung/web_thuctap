"""Tự đăng ký công ty (xác thực email bằng OTP) và lời mời người dùng vào công ty."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from src.api.auth import get_current_user, require_chief_accountant, to_auth_user
from src.api.uploads import get_frontend_base_url
from src.config import get_settings
from src.database import get_db
from src.models.schemas import (
    InvitationAcceptRequest,
    InvitationCreateRequest,
    InvitationLookupResponse,
    InvitationOut,
    LoginResponse,
    SignupRequestIn,
    SignupResendRequest,
    SignupStartResponse,
    SignupVerifyRequest,
)
from src.models.signup import UserInvitation
from src.models.user import User
from src.services.auth import create_user_session, write_audit_log
from src.services.signup import (
    SignupError,
    accept_invitation,
    complete_signup,
    create_invitation,
    find_invitation_by_token,
    list_pending_invitations,
    resend_signup_otp,
    revoke_invitation,
    send_invitation,
    start_signup,
)

router = APIRouter(prefix="/auth", tags=["signup"])


def client_info(request: Request) -> tuple[str | None, str | None]:
    return (request.client.host if request.client else None), request.headers.get("user-agent")


def to_http_error(exc: SignupError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(status_code=exc.status_code, detail=str(exc), headers=headers)


def to_invitation_out(invitation: UserInvitation, accept_url: str | None = None) -> InvitationOut:
    return InvitationOut(
        id=str(invitation.id),
        email=invitation.email,
        full_name=invitation.full_name,
        role_code=invitation.role_code,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
        accept_url=accept_url,
    )


def login_new_user(db: Session, user: User, request: Request, action: str) -> LoginResponse:
    ip_address, user_agent = client_info(request)
    access_token = create_user_session(db=db, user=user, ip_address=ip_address, user_agent=user_agent)
    write_audit_log(
        db=db,
        action=action,
        user=user,
        details={"email": user.email, "role": user.role.code},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return LoginResponse(access_token=access_token, user=to_auth_user(user))


# --- Đăng ký ------------------------------------------------------------------------------------------------------


@router.post("/signup", response_model=SignupStartResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequestIn, request: Request, db: Session = Depends(get_db)) -> SignupStartResponse:
    ip_address, _ = client_info(request)
    try:
        signup_request = start_signup(
            db,
            company_name=payload.company_name,
            tax_id=payload.tax_id,
            full_name=payload.full_name,
            email=payload.email,
            password=payload.password,
            ip_address=ip_address,
        )
    except SignupError as exc:
        raise to_http_error(exc) from exc

    settings = get_settings()
    return SignupStartResponse(
        signup_id=str(signup_request.id),
        email=signup_request.email,
        expires_in_seconds=settings.password_otp_ttl_seconds,
        resend_after_seconds=settings.password_otp_resend_seconds,
    )


@router.post("/signup/resend", response_model=SignupStartResponse)
async def signup_resend(payload: SignupResendRequest, db: Session = Depends(get_db)) -> SignupStartResponse:
    try:
        signup_request = resend_signup_otp(db, payload.signup_id)
    except SignupError as exc:
        raise to_http_error(exc) from exc

    settings = get_settings()
    return SignupStartResponse(
        signup_id=str(signup_request.id),
        email=signup_request.email,
        expires_in_seconds=settings.password_otp_ttl_seconds,
        resend_after_seconds=settings.password_otp_resend_seconds,
    )


@router.post("/signup/verify", response_model=LoginResponse)
async def signup_verify(payload: SignupVerifyRequest, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    try:
        user = complete_signup(db, payload.signup_id, payload.otp)
    except SignupError as exc:
        raise to_http_error(exc) from exc
    return login_new_user(db, user, request, "ORGANIZATION_SIGNED_UP")


# --- Lời mời ------------------------------------------------------------------------------------------------------


@router.get("/invitations", response_model=list[InvitationOut])
async def list_invitations(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[InvitationOut]:
    require_chief_accountant(current_user)
    return [to_invitation_out(invitation) for invitation in list_pending_invitations(db)]


@router.post("/invitations", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
async def invite_user(
    payload: InvitationCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InvitationOut:
    require_chief_accountant(current_user)
    try:
        invitation, token = create_invitation(
            db, current_user, email=payload.email, full_name=payload.full_name, role_code=payload.role_code
        )
    except SignupError as exc:
        raise to_http_error(exc) from exc

    accept_url = send_invitation(invitation, token, current_user, get_frontend_base_url(request))
    ip_address, user_agent = client_info(request)
    write_audit_log(
        db=db,
        action="USER_INVITED",
        user=current_user,
        target_type="INVITATION",
        target_id=str(invitation.id),
        details={"invited_email": invitation.email, "role": invitation.role_code},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return to_invitation_out(invitation, accept_url)


@router.delete("/invitations/{invitation_id}", response_model=InvitationOut)
async def cancel_invitation(
    invitation_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InvitationOut:
    require_chief_accountant(current_user)
    try:
        invitation = revoke_invitation(db, invitation_id)
    except SignupError as exc:
        raise to_http_error(exc) from exc

    ip_address, user_agent = client_info(request)
    write_audit_log(
        db=db,
        action="INVITATION_REVOKED",
        user=current_user,
        target_type="INVITATION",
        target_id=str(invitation.id),
        details={"invited_email": invitation.email},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return to_invitation_out(invitation)


@router.get("/invitations/lookup", response_model=InvitationLookupResponse)
async def lookup_invitation(
    token: str = Query(..., min_length=20, max_length=200), db: Session = Depends(get_db)
) -> InvitationLookupResponse:
    try:
        invitation = find_invitation_by_token(db, token)
    except SignupError as exc:
        raise to_http_error(exc) from exc
    return InvitationLookupResponse(
        email=invitation.email,
        full_name=invitation.full_name,
        role_code=invitation.role_code,
        organization_name=invitation.organization.name,
        expires_at=invitation.expires_at,
    )


@router.post("/invitations/accept", response_model=LoginResponse)
async def accept_user_invitation(
    payload: InvitationAcceptRequest, request: Request, db: Session = Depends(get_db)
) -> LoginResponse:
    try:
        user = accept_invitation(db, payload.token, payload.password, payload.full_name)
    except SignupError as exc:
        raise to_http_error(exc) from exc
    return login_new_user(db, user, request, "INVITATION_ACCEPTED")

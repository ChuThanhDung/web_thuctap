from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.config import get_settings
from src.database import get_db
from src.models.schemas import (
    AuthUser,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    OtpRequestResponse,
    OtpVerifyRequest,
    OtpVerifyResponse,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    UserCreateRequest,
    UserListResponse,
)
from src.models.user import User
from src.services.auth import (
    authenticate_user,
    change_password_with_reset_token,
    create_password_reset_otp,
    create_user_by_admin,
    create_user_session,
    get_user_by_session_token,
    verify_password_reset_otp,
    write_audit_log,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def to_auth_user(user: User) -> AuthUser:
    role_code = user.role.code if user.role else "accountant"
    role_name = user.role.name if user.role else "Kế toán viên"
    return AuthUser(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=role_code,
        role_name=role_name,
        department=user.department,
        employee_code=user.employee_code,
        date_of_birth=user.date_of_birth,
        address=user.address,
        citizen_id=user.citizen_id,
        phone=user.phone,
        avatar_url=user.avatar_url,
    )


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vui lòng đăng nhập lại.")

    access_token = authorization.removeprefix("Bearer ").strip()
    user = get_user_by_session_token(db, access_token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập đã hết hạn.")

    return user


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    user = authenticate_user(db, payload.email, payload.password)

    if user is None:
        write_audit_log(
            db=db,
            action="LOGIN_FAILED",
            user=None,
            details={"email": payload.email.lower().strip()},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng.",
        )

    access_token = create_user_session(
        db=db,
        user=user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    write_audit_log(
        db=db,
        action="LOGIN_SUCCESS",
        user=user,
        details={"role": user.role.code},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return LoginResponse(access_token=access_token, user=to_auth_user(user))


@router.get("/me", response_model=AuthUser)
async def get_profile(current_user: User = Depends(get_current_user)) -> AuthUser:
    return to_auth_user(current_user)


@router.patch("/me", response_model=AuthUser)
async def update_profile(
    payload: ProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    current_user.full_name = payload.full_name.strip()
    current_user.date_of_birth = payload.date_of_birth
    current_user.address = payload.address.strip() if payload.address else None
    current_user.phone = payload.phone.strip() if payload.phone else None
    db.commit()
    db.refresh(current_user)

    write_audit_log(
        db=db,
        action="PROFILE_UPDATED",
        user=current_user,
        details={"email": current_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return to_auth_user(current_user)


@router.post("/password/otp", response_model=OtpRequestResponse)
async def request_password_otp(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OtpRequestResponse:
    otp = create_password_reset_otp(db, current_user)
    print(f"[password-reset-otp] user={current_user.email} otp={otp}")
    write_audit_log(
        db=db,
        action="PASSWORD_OTP_REQUESTED",
        user=current_user,
        details={"email": current_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    settings = get_settings()
    return OtpRequestResponse(
        message="Mã OTP đã được gửi tới email của bạn.",
        dev_otp=otp if settings.app_env == "development" else None,
    )


@router.post("/password/otp/verify", response_model=OtpVerifyResponse)
async def verify_password_otp(
    payload: OtpVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OtpVerifyResponse:
    reset_token = verify_password_reset_otp(db, current_user, payload.otp)
    if reset_token is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mã OTP không đúng hoặc đã hết hạn.")

    return OtpVerifyResponse(reset_token=reset_token)


@router.post("/password/change", response_model=MessageResponse)
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu nhập lại không khớp.")

    changed = change_password_with_reset_token(db, current_user, payload.reset_token, payload.new_password)
    if not changed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phiên đổi mật khẩu không hợp lệ.")

    write_audit_log(
        db=db,
        action="PASSWORD_CHANGED",
        user=current_user,
        details={"email": current_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return MessageResponse(message="Đổi mật khẩu thành công.")


@router.post("/users", response_model=AuthUser, status_code=status.HTTP_201_CREATED)
async def create_user_account(
    payload: UserCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    """Tạo mới tài khoản người dùng — chỉ Kế toán trưởng (`chief_accountant`)."""
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán trưởng mới có quyền tạo tài khoản người dùng mới.",
        )

    try:
        new_user = create_user_by_admin(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    write_audit_log(
        db=db,
        action="USER_CREATED",
        user=current_user,
        target_type="USER",
        target_id=str(new_user.id),
        details={"created_user_email": new_user.email, "role": new_user.role.code},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return to_auth_user(new_user)


@router.get("/users", response_model=UserListResponse)
async def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserListResponse:
    """Xem danh sách tài khoản người dùng — chỉ Kế toán trưởng (`chief_accountant`)."""
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán trưởng mới có quyền xem danh sách người dùng.",
        )

    stmt = select(User).options(selectinload(User.role)).order_by(User.created_at.desc())
    users = db.scalars(stmt).all()
    return UserListResponse(
        items=[to_auth_user(u) for u in users],
        total=len(users),
    )


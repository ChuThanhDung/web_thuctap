from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile, status
from fastapi import Path as ApiPath
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.database import get_db
from src.models.schemas import (
    AuthUser,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    OtpRequestResponse,
    OtpVerifyRequest,
    PasswordChangeInitiateRequest,
    ProfileUpdateRequest,
    UserCreateRequest,
    UserListResponse,
)
from src.models.user import User
from src.services.auth import (
    PasswordChangeError,
    authenticate_user,
    create_user_by_admin,
    create_user_session,
    get_user_by_session_token,
    initiate_password_change,
    verify_password_change_otp,
    write_audit_log,
)
from src.services.avatar import (
    MAX_AVATAR_BYTES,
    AvatarValidationError,
    delete_avatar_by_url,
    process_avatar,
    resolve_avatar_file,
    save_avatar,
    validate_avatar_metadata,
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


@router.put("/me/avatar", response_model=AuthUser)
async def update_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    try:
        validate_avatar_metadata(file.filename, file.content_type)
        content = await file.read(MAX_AVATAR_BYTES + 1)
        if len(content) > MAX_AVATAR_BYTES:
            raise AvatarValidationError("Ảnh đại diện không được vượt quá 5 MB.")
        webp_content = process_avatar(content, file.filename, file.content_type)
    except AvatarValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        await file.close()

    old_avatar_url = current_user.avatar_url
    avatar_url, new_avatar_path = save_avatar(current_user.id, webp_content)
    try:
        current_user.avatar_url = avatar_url
        db.commit()
        db.refresh(current_user)
    except Exception:
        db.rollback()
        new_avatar_path.unlink(missing_ok=True)
        raise

    if old_avatar_url != avatar_url:
        delete_avatar_by_url(old_avatar_url)

    write_audit_log(
        db=db,
        action="AVATAR_UPDATED",
        user=current_user,
        details={"avatar_url": avatar_url},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return to_auth_user(current_user)


@router.get("/avatars/{filename}", response_model=None)
async def view_avatar(
    filename: str = ApiPath(pattern=r"^[0-9a-f-]{36}_[0-9a-f]{32}\.webp$"),
) -> FileResponse:
    avatar_path = resolve_avatar_file(filename)
    if avatar_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ảnh đại diện.")

    return FileResponse(
        avatar_path,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/password/otp", response_model=OtpRequestResponse)
async def request_password_otp(
    payload: PasswordChangeInitiateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OtpRequestResponse:
    try:
        expires_in, resend_after = initiate_password_change(
            db,
            current_user,
            payload.current_password,
            payload.new_password,
            payload.confirm_password,
        )
    except PasswordChangeError as exc:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS if exc.retry_after else status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
            headers=headers,
        ) from exc
    write_audit_log(
        db=db,
        action="PASSWORD_OTP_REQUESTED",
        user=current_user,
        details={"email": current_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return OtpRequestResponse(
        message="Mã OTP đã được gửi tới email của bạn.",
        expires_in_seconds=expires_in,
        resend_after_seconds=resend_after,
    )


@router.post("/password/otp/verify", response_model=MessageResponse)
async def verify_password_otp(
    payload: OtpVerifyRequest,
    request: Request,
    authorization: str = Header(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    access_token = authorization.removeprefix("Bearer ").strip()
    try:
        verify_password_change_otp(db, current_user, payload.otp, access_token)
    except PasswordChangeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    write_audit_log(
        db=db,
        action="PASSWORD_CHANGED",
        user=current_user,
        details={"email": current_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return MessageResponse(message="Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được đăng xuất.")


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

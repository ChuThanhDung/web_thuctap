import uuid

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile, status
from fastapi import Path as ApiPath
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from src.config import get_settings
from src.database import get_db, set_organization_context
from src.models.organization import Organization
from src.models.role import Role
from src.models.schemas import (
    AuthUser,
    LoginRequest,
    LoginResponse,
    LoginStepResponse,
    MessageResponse,
    OrganizationSummary,
    OtpRequestResponse,
    OtpVerifyRequest,
    PasswordChangeInitiateRequest,
    ProfileUpdateRequest,
    UserCreateRequest,
    UserListResponse,
    UserUpdateRequest,
)
from src.models.user import User
from src.services.auth import (
    PasswordChangeError,
    authenticate_user,
    build_next_employee_code,
    create_user_by_admin,
    create_user_session,
    email_in_use,
    get_user_by_session_token,
    initiate_password_change,
    is_login_rate_limited,
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
from src.services.crypto import blind_index, mask_citizen_id
from src.services.mfa import create_challenge, mfa_enabled, mfa_setup_pending
from src.services.organizations import effective_plan
from src.services.plans import ensure_can_add_user

router = APIRouter(prefix="/auth", tags=["auth"])

PLATFORM_ADMIN = "platform_admin"
# Admin nền tảng không thuộc công ty nào: chỉ dùng trang quản trị và hồ sơ của mình, không gọi API nghiệp vụ.
PLATFORM_ADMIN_PATHS = (
    "/api/v1/admin",
    "/api/v1/auth/me",
    "/api/v1/auth/password",
    "/api/v1/auth/avatars",
    # Chuông thông báo trên thanh bên (RLS trả về rỗng vì admin không thuộc công ty).
    "/api/v1/notifications",
)


# Kế toán trưởng/admin chưa bật 2FA (khi bắt buộc) chỉ gọi được các API để cài đặt 2FA.
MFA_SETUP_PATHS = ("/api/v1/auth/me", "/api/v1/auth/mfa")


def to_organization_summary(organization: Organization | None) -> OrganizationSummary | None:
    if organization is None:
        return None
    return OrganizationSummary(
        id=str(organization.id),
        name=organization.name,
        plan=organization.plan,
        effective_plan=effective_plan(organization),
        trial_ends_at=organization.trial_ends_at,
        plan_expires_at=organization.plan_expires_at,
        status=organization.status,
    )


def organization_block_reason(user: User) -> str | None:
    """Lý do không cho tài khoản dùng hệ thống (công ty bị khóa, tài khoản lỗi), hoặc None nếu được phép."""
    if user.organization_id is None:
        return None if user.role.code == PLATFORM_ADMIN else "Tài khoản chưa thuộc công ty nào."
    if user.organization is None or user.organization.status != "active":
        return "Công ty của bạn đang tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ."
    return None


def to_auth_user(user: User) -> AuthUser:
    role_code = user.role.code if user.role else "accountant"
    role_name = user.role.name if user.role else "Kế toán viên"
    return AuthUser(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=role_code,
        role_name=role_name,
        status=user.status,
        department=user.department,
        employee_code=user.employee_code,
        date_of_birth=user.date_of_birth,
        address=user.address,
        # CCCD luôn che bớt; kế toán trưởng xem đủ qua GET /auth/users/{id}/citizen-id (có ghi nhật ký).
        citizen_id=mask_citizen_id(user.citizen_id),
        mfa_enabled=mfa_enabled(user),
        mfa_setup_required=mfa_setup_pending(user),
        phone=user.phone,
        avatar_url=user.avatar_url,
        organization=to_organization_summary(user.organization),
    )


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vui lòng đăng nhập lại.")

    access_token = authorization.removeprefix("Bearer ").strip()
    user = get_user_by_session_token(db, access_token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập đã hết hạn.")
    block_reason = organization_block_reason(user)
    if block_reason:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=block_reason)
    if mfa_setup_pending(user) and not request.url.path.startswith(MFA_SETUP_PATHS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản của bạn cần bật xác thực hai lớp trước khi tiếp tục.",
        )
    if user.role.code == PLATFORM_ADMIN and not request.url.path.startswith(PLATFORM_ADMIN_PATHS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản quản trị nền tảng không dùng được chức năng nghiệp vụ của công ty.",
        )

    # Từ đây phiên DB chỉ thấy và chỉ ghi được dữ liệu công ty của người dùng (Row-Level Security).
    set_organization_context(db, user.organization_id)
    return user


@router.post("/login", response_model=LoginStepResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginStepResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    if is_login_rate_limited(db, payload.email, ip_address):
        write_audit_log(
            db=db,
            action="LOGIN_BLOCKED",
            user=None,
            details={"email": payload.email.lower().strip()},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        lockout_seconds = get_settings().login_lockout_minutes * 60
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.",
            headers={"Retry-After": str(lockout_seconds)},
        )

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

    block_reason = organization_block_reason(user)
    if block_reason:
        write_audit_log(
            db=db,
            action="LOGIN_BLOCKED_ORGANIZATION",
            user=user,
            details={"email": user.email},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=block_reason)

    if mfa_enabled(user):
        # Mật khẩu đúng nhưng chưa tạo phiên: phải qua bước mã 2FA (POST /auth/login/mfa).
        write_audit_log(
            db=db,
            action="LOGIN_PASSWORD_OK_MFA_PENDING",
            user=user,
            details={"email": user.email},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginStepResponse(mfa_required=True, mfa_token=create_challenge(db, user, ip_address))

    return LoginStepResponse(**finish_login(db, user, ip_address, user_agent, method="password").model_dump())


def finish_login(db: Session, user: User, ip_address: str | None, user_agent: str | None, method: str) -> LoginResponse:
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
        details={"role": user.role.code, "method": method},
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
    ensure_can_add_user(db, current_user.organization)

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


def require_chief_accountant(current_user: User) -> None:
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán trưởng mới có quyền quản lý người dùng.",
        )


def get_managed_user(db: Session, user_id: str) -> User:
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id không hợp lệ.") from exc

    user = db.scalars(select(User).options(selectinload(User.role)).where(User.id == parsed_id)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")
    return user


def count_active_chief_accountants(db: Session) -> int:
    return (
        db.scalar(
            select(func.count(User.id)).join(Role).where(Role.code == "chief_accountant", User.status == "ACTIVE")
        )
        or 0
    )


def ensure_unique_user_fields(db: Session, target_user: User, payload: UserUpdateRequest) -> None:
    if payload.email is not None:
        if email_in_use(payload.email, exclude_user_id=target_user.id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email này đã được sử dụng.")

    if payload.citizen_id:
        citizen_id = payload.citizen_id.strip()
        exists = db.scalars(
            select(User).where(User.citizen_id_hash == blind_index(citizen_id), User.id != target_user.id)
        ).first()
        if exists:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Căn cước công dân này đã tồn tại.")


@router.patch("/users/{user_id}", response_model=AuthUser)
async def update_user_account(
    user_id: str,
    payload: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    require_chief_accountant(current_user)
    target_user = get_managed_user(db, user_id)
    ensure_unique_user_fields(db, target_user, payload)

    next_role = target_user.role
    if payload.role_code is not None:
        next_role = db.scalars(select(Role).where(Role.code == payload.role_code)).first()
        if next_role is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vai trò không hợp lệ.")
        if (
            target_user.role.code == "chief_accountant"
            and next_role.code != "chief_accountant"
            and target_user.status == "ACTIVE"
            and count_active_chief_accountants(db) <= 1
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Không thể đổi vai trò của Kế toán trưởng active cuối cùng.",
            )

    if payload.email is not None:
        target_user.email = payload.email.lower().strip()
    if payload.full_name is not None:
        target_user.full_name = payload.full_name.strip()
    if payload.role_code is not None:
        target_user.role_id = next_role.id
        expected_prefix = "CHIEF" if next_role.code == "chief_accountant" else "ACC"
        if not (target_user.employee_code or "").startswith(expected_prefix):
            target_user.employee_code = build_next_employee_code(db, next_role.code)
    target_user.department = "Phòng Kế toán - Tài chính"
    if payload.phone is not None:
        target_user.phone = payload.phone.strip() or None
    if payload.citizen_id is not None:
        target_user.citizen_id = payload.citizen_id.strip() or None
        target_user.citizen_id_hash = blind_index(target_user.citizen_id)
    if payload.address is not None:
        target_user.address = payload.address.strip() or None
    if payload.date_of_birth is not None:
        target_user.date_of_birth = payload.date_of_birth

    db.commit()
    db.refresh(target_user)

    write_audit_log(
        db=db,
        action="USER_UPDATED",
        user=current_user,
        target_type="USER",
        target_id=str(target_user.id),
        details={"updated_user_email": target_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return to_auth_user(target_user)


@router.delete("/users/{user_id}", response_model=AuthUser)
async def deactivate_user_account(
    user_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    require_chief_accountant(current_user)
    target_user = get_managed_user(db, user_id)
    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể vô hiệu hóa tài khoản đang đăng nhập.",
        )
    if (
        target_user.role.code == "chief_accountant"
        and target_user.status == "ACTIVE"
        and count_active_chief_accountants(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể vô hiệu hóa Kế toán trưởng active cuối cùng.",
        )

    target_user.status = "DEACTIVE"
    db.commit()
    db.refresh(target_user)

    write_audit_log(
        db=db,
        action="USER_DEACTIVATED",
        user=current_user,
        target_type="USER",
        target_id=str(target_user.id),
        details={"deactivated_user_email": target_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return to_auth_user(target_user)


@router.patch("/users/{user_id}/activate", response_model=AuthUser)
async def activate_user_account(
    user_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    require_chief_accountant(current_user)
    target_user = get_managed_user(db, user_id)
    if target_user.status.upper() != "ACTIVE":
        ensure_can_add_user(db, current_user.organization)
    target_user.status = "ACTIVE"
    db.commit()
    db.refresh(target_user)

    write_audit_log(
        db=db,
        action="USER_ACTIVATED",
        user=current_user,
        target_type="USER",
        target_id=str(target_user.id),
        details={"activated_user_email": target_user.email},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return to_auth_user(target_user)

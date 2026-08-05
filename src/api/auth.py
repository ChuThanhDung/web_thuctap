from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from src.database import get_db
from src.models.schemas import AuthUser, LoginRequest, LoginResponse
from src.services.auth import authenticate_user, create_user_session, write_audit_log

router = APIRouter(prefix="/auth", tags=["auth"])


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

    return LoginResponse(
        access_token=access_token,
        user=AuthUser(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=user.role.code,
            role_name=user.role.name,
            department=user.department,
            employee_code=user.employee_code,
        ),
    )

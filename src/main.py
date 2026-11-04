import logging
from contextlib import asynccontextmanager
from secrets import token_urlsafe

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

import src.models  # noqa: F401
from src.api.admin import router as admin_router
from src.api.audit_logs import router as audit_logs_router
from src.api.auth import router as auth_router
from src.api.billing import router as billing_router
from src.api.notifications import router as notifications_router
from src.api.reconciliations import router as reconciliations_router
from src.api.routes import router
from src.api.signup import router as signup_router
from src.api.thresholds import router as thresholds_router
from src.api.uploads import router as uploads_router
from src.config import get_settings
from src.database import engine
from src.db_migrations import run_migrations
from src.logging_config import configure_logging, install_request_logging
from src.schema_bootstrap import ensure_database_timezone
from src.services.plans import PlanLimitError

logger = logging.getLogger(__name__)
settings = get_settings()
configure_logging(settings.log_level, settings.log_format)


def init_sentry() -> bool:
    """Bật Sentry khi có SENTRY_DSN. Không gửi dữ liệu cá nhân (email, IP, body request)."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.sentry_release or None,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )
    return True


init_sentry()


def secure_default_password_accounts() -> None:
    from sqlalchemy.orm import Session

    from src.services.auth import lock_known_default_password_accounts

    production = settings.app_env == "production"
    with Session(engine) as db:
        emails = lock_known_default_password_accounts(db, production=production)
    if not emails:
        return
    if production:
        logger.error(
            "Các tài khoản dùng mật khẩu mặc định đã bị đặt lại ngẫu nhiên: %s. "
            "Dùng `python scripts/reset_password.py <email>` để đặt mật khẩu mới.",
            ", ".join(emails),
        )
    else:
        logger.warning(
            "Các tài khoản đang dùng mật khẩu mặc định (chỉ chấp nhận ngoài production): %s", ", ".join(emails)
        )


def seed_initial_data_if_needed() -> None:
    from sqlalchemy.orm import Session

    from src.database import use_system_context
    from src.models.organization import DEMO_ORGANIZATION_ID
    from src.models.role import Role
    from src.models.user import User
    from src.services.auth import hash_password, next_public_user_id
    from src.services.organizations import ensure_default_thresholds

    with Session(engine) as db:
        # Tài khoản seed và ngưỡng mặc định thuộc công ty Demo (migration 0003 tạo công ty này).
        use_system_context(db, DEMO_ORGANIZATION_ID)
        try:
            acc_role = db.query(Role).filter(Role.code == "accountant").first()
            if not acc_role:
                acc_role = Role(
                    code="accountant",
                    name="Kế toán viên",
                    description="Thực hiện đối soát hóa đơn, tải chứng từ và theo dõi nhật ký nghiệp vụ.",
                )
                db.add(acc_role)
            else:
                acc_role.name = "Kế toán viên"
                acc_role.description = "Thực hiện đối soát hóa đơn, tải chứng từ và theo dõi nhật ký nghiệp vụ."

            chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()
            if not chief_role:
                chief_role = Role(
                    code="chief_accountant",
                    name="Kế toán trưởng",
                    description="Theo dõi tổng quan, phê duyệt đối soát và cấu hình quy trình.",
                )
                db.add(chief_role)
            else:
                chief_role.name = "Kế toán trưởng"
                chief_role.description = "Theo dõi tổng quan, phê duyệt đối soát và cấu hình quy trình."

            # Vai trò admin nền tảng (migration 0004 cũng tạo). Tài khoản tạo bằng scripts/create_platform_admin.py.
            if not db.query(Role).filter(Role.code == "platform_admin").first():
                db.add(
                    Role(
                        code="platform_admin",
                        name="Quản trị nền tảng",
                        description="Quản lý công ty khách hàng, gói dịch vụ và mức sử dụng. Không xem chứng từ của khách.",
                    )
                )

            db.commit()

            acc_role = db.query(Role).filter(Role.code == "accountant").first()
            chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()

            ensure_default_thresholds(db, DEMO_ORGANIZATION_ID)

            created_emails: list[str] = []
            seed_password = settings.seed_default_password or token_urlsafe(12)
            default_password_hash = hash_password(seed_password)

            default_users = [
                {
                    "email": "accountant@docusync.ai",
                    "full_name": "Nguyễn Thị Lan",
                    "role_id": acc_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "ACC-001",
                },
                {
                    "email": "chief.accountant@docusync.ai",
                    "full_name": "Trần Văn Minh",
                    "role_id": chief_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "CHIEF-001",
                },
            ]

            for udata in default_users if settings.seed_default_users else []:
                user = db.query(User).filter(User.email == udata["email"]).first()
                if not user:
                    user = User(
                        organization_id=DEMO_ORGANIZATION_ID,
                        public_id=next_public_user_id(db),
                        email=udata["email"],
                        password_hash=default_password_hash,
                        full_name=udata["full_name"],
                        role_id=udata["role_id"],
                        department=udata["department"],
                        employee_code=udata["employee_code"],
                        status="ACTIVE",
                    )
                    db.add(user)
                    created_emails.append(udata["email"])
                elif user.public_id is None:
                    user.public_id = next_public_user_id(db)

            db.commit()
            print("Seed initial users & roles successfully.")
            if created_emails and not settings.seed_default_password:
                logger.warning(
                    "Đã tạo tài khoản ban đầu %s với mật khẩu ngẫu nhiên (chỉ hiển thị một lần): %s. "
                    "Hãy đổi ngay sau khi đăng nhập hoặc đặt SEED_DEFAULT_PASSWORD.",
                    ", ".join(created_emails),
                    seed_password,
                )
        except Exception as e:
            db.rollback()
            print(f"Error seeding initial data: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    ensure_database_timezone()
    if settings.run_migrations_on_startup:
        run_migrations()
    # Kết nối mở trước khi migration tạo role docusync_app vẫn là tài khoản chủ DB (bỏ qua RLS): bỏ hết để mở lại.
    engine.dispose()
    seed_initial_data_if_needed()
    secure_default_password_accounts()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    yield
    print("Shutting down...")


docs_enabled = settings.app_env != "production" or settings.docs_enabled_in_production
app = FastAPI(
    title="AI20K Agent",
    description="AI Agent built with LangGraph",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

install_request_logging(app)
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.vercel\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(PlanLimitError)
async def plan_limit_exception_handler(request: Request, exc: PlanLimitError):
    # 402: vượt hạn mức gói. Giao diện hiện thông báo và đưa tới trang nâng cấp.
    return JSONResponse(
        status_code=402,
        content={"detail": str(exc), "code": "plan_limit", "resource": exc.resource},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception at %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Lỗi máy chủ nội bộ. Vui lòng thử lại sau."},
    )


app.include_router(router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(signup_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(billing_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(reconciliations_router, prefix="/api/v1")
app.include_router(audit_logs_router, prefix="/api/v1")
app.include_router(thresholds_router, prefix="/api/v1")
app.include_router(uploads_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"status": "ok", "message": "DocuSyncAI Backend is running", "env": settings.app_env}


@app.head("/")
async def root_head():
    return None


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}


@app.head("/health")
async def health_head():
    return None


@app.get("/health/ready")
async def health_ready():
    """Readiness: xác nhận kết nối được tới database."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Readiness check failed")
        return JSONResponse(status_code=503, content={"status": "unavailable", "database": "down"})
    return {"status": "ok", "database": "up"}

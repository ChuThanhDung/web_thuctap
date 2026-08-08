from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import src.models  # noqa: F401
from src.api.audit_logs import router as audit_logs_router
from src.api.auth import router as auth_router
from src.api.reconciliations import router as reconciliations_router
from src.api.routes import router
from src.api.thresholds import router as thresholds_router
from src.api.uploads import router as uploads_router
from src.config import get_settings
from src.database import Base, engine


def ensure_user_profile_columns() -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS citizen_id VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_citizen_id_unique ON users (citizen_id) WHERE citizen_id IS NOT NULL",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def seed_initial_data_if_needed() -> None:
    from sqlalchemy.orm import Session

    from src.models.role import Role
    from src.models.user import User
    from src.services.auth import hash_password

    with Session(engine) as db:
        try:
            acc_role = db.query(Role).filter(Role.code == "accountant").first()
            if not acc_role:
                acc_role = Role(
                    code="accountant",
                    name="Kế toán viên",
                    description="Thực hiện đối soát hóa đơn, tải chứng từ và theo dõi nhật ký nghiệp vụ.",
                )
                db.add(acc_role)

            chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()
            if not chief_role:
                chief_role = Role(
                    code="chief_accountant",
                    name="Kế toán trưởng",
                    description="Theo dõi tổng quan, phê duyệt đối soát và cấu hình quy trình.",
                )
                db.add(chief_role)

            db.commit()

            acc_role = db.query(Role).filter(Role.code == "accountant").first()
            chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()

            default_password_hash = hash_password("123456")

            default_users = [
                {
                    "email": "chuthanhdungtruong@gmail.com",
                    "full_name": "Chu Thanh Dũng (Kế toán trưởng)",
                    "role_id": chief_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "CHIEF-002",
                },
                {
                    "email": "chuthanhdung@gmail.com",
                    "full_name": "Chu Thanh Dũng (Kế toán viên)",
                    "role_id": acc_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "ACC-002",
                },
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

            for udata in default_users:
                user = db.query(User).filter(User.email == udata["email"]).first()
                if not user:
                    user = User(
                        email=udata["email"],
                        password_hash=default_password_hash,
                        full_name=udata["full_name"],
                        role_id=udata["role_id"],
                        department=udata["department"],
                        employee_code=udata["employee_code"],
                        status="ACTIVE",
                    )
                    db.add(user)
                else:
                    user.password_hash = default_password_hash
                    user.role_id = udata["role_id"]
                    user.full_name = udata["full_name"]
                    user.status = "ACTIVE"

            db.commit()
            print("Seed initial users & roles successfully.")
        except Exception as e:
            db.rollback()
            print(f"Error seeding initial data: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    ensure_user_profile_columns()
    seed_initial_data_if_needed()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    yield
    print("Shutting down...")



app = FastAPI(
    title="AI20K Agent",
    description="AI Agent built with LangGraph",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(reconciliations_router, prefix="/api/v1")
app.include_router(audit_logs_router, prefix="/api/v1")
app.include_router(thresholds_router, prefix="/api/v1")
app.include_router(uploads_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}

from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    ensure_user_profile_columns()
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

from sqlalchemy.orm import Session
from src.database import get_db
from src.models.reconciliation import ReconciliationCase

@app.get("/db-count")
async def db_count(db: Session = Depends(get_db)):
    return {"count": db.query(ReconciliationCase).count()}

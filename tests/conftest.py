import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from src.config import Settings


def _use_isolated_test_database() -> str:
    """Chạy test trên database riêng `<tên>_test`, không bao giờ chạm dữ liệu dev/production.

    Phải thực hiện trước khi import `src.main` (engine được tạo lúc import). Nhiều test xóa sạch bảng batch, file và
    thông báo; chạy chúng trên DB đang dùng sẽ làm mất các bộ chứng từ đã duyệt.
    """
    url = make_url(os.environ.get("DATABASE_URL") or Settings().database_url)
    test_name = url.database if url.database.endswith("_test") else f"{url.database}_test"

    admin_engine = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as connection:
            exists = connection.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": test_name}).scalar()
            if not exists:
                connection.execute(text('CREATE DATABASE "' + test_name.replace('"', '""') + '"'))
    finally:
        admin_engine.dispose()

    test_url = url.set(database=test_name).render_as_string(hide_password=False)
    os.environ["DATABASE_URL"] = test_url
    return test_url


TEST_DATABASE_URL = _use_isolated_test_database()

from src.main import app  # noqa: E402


def purge_batch_tables(db: Session) -> None:
    """Xóa dữ liệu batch trong DB test. Batch `final_approved` được trigger bảo vệ nên hạ trạng thái trước."""
    from src.models.notification import Notification
    from src.models.reconciliation import DocumentBatch, UploadedDocumentExtraction, UploadedFile

    db.execute(text("UPDATE document_batches SET status = 'cleanup' WHERE status = 'final_approved'"))
    db.query(UploadedDocumentExtraction).delete()
    db.query(UploadedFile).delete()
    db.query(Notification).delete()
    db.query(DocumentBatch).delete()
    db.commit()


@pytest.fixture(scope="session", autouse=True)
def init_db():
    from src.config import get_settings
    from src.database import engine
    from src.db_migrations import run_migrations
    from src.main import seed_initial_data_if_needed
    from src.models.reconciliation import ReconciliationCase
    from src.schema_bootstrap import ensure_database_timezone

    assert engine.url.database.endswith("_test"), "Test phải chạy trên database *_test"

    import src.api.uploads as uploads_api

    # File upload và avatar của test ghi vào thư mục tạm, không lẫn với storage thật.
    storage_root = Path(tempfile.mkdtemp(prefix="docusync-test-storage-"))
    originals = (uploads_api.PROJECT_ROOT, uploads_api.UPLOAD_STORAGE_ROOT, uploads_api.INVOICE_ARCHIVE_ROOT)
    uploads_api.PROJECT_ROOT = storage_root
    uploads_api.UPLOAD_STORAGE_ROOT = storage_root / "storage" / "upload"
    uploads_api.INVOICE_ARCHIVE_ROOT = storage_root / "invoice"

    settings = get_settings()
    settings.avatar_storage_dir = str(storage_root / "storage" / "avatars")
    settings.openai_api_key = ""
    settings.document_ai_validation_required = False
    # Các test đăng nhập bằng tài khoản seed; production không bao giờ chấp nhận mật khẩu này.
    settings.seed_default_password = "123456"

    ensure_database_timezone()
    run_migrations()
    seed_initial_data_if_needed()

    with Session(engine) as db:
        case = db.query(ReconciliationCase).first()
        if not case:
            case = ReconciliationCase(
                case_number="DOC-0001",
                status="pending",
                risk_level="LOW",
                partner_name="CÔNG TY TEST",
                total_amount=100000.0,
            )
            db.add(case)
            db.commit()

    yield
    uploads_api.PROJECT_ROOT, uploads_api.UPLOAD_STORAGE_ROOT, uploads_api.INVOICE_ARCHIVE_ROOT = originals
    shutil.rmtree(storage_root, ignore_errors=True)


@pytest.fixture
def db_session():
    """Provides a database session for tests."""
    from src.database import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock


@pytest.fixture
def other_accountant(db_session):
    """Một kế toán viên thứ hai, tạo riêng cho test và xóa sau khi xong."""
    import uuid

    from src.models.role import Role
    from src.models.user import User
    from src.services.auth import hash_password

    role = db_session.query(Role).filter(Role.code == "accountant").one()
    next_public_id = db_session.execute(text("SELECT COALESCE(MAX(public_id), 0) + 1 FROM users")).scalar()
    user = User(
        public_id=next_public_id,
        email=f"other-accountant-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Other-Pass1"),
        full_name="Other Accountant",
        role_id=role.id,
        status="ACTIVE",
    )
    db_session.add(user)
    db_session.commit()
    yield user
    db_session.rollback()
    purge_batch_tables(db_session)
    db_session.delete(user)
    db_session.commit()

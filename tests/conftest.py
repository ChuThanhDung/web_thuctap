from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import Session

from src.main import app


@pytest.fixture(scope="session", autouse=True)
def init_db():
    from src.database import Base, engine
    from src.main import (
        ensure_document_batch_tables,
        ensure_uploaded_document_extraction_tables,
        ensure_uploaded_file_storage_columns,
        ensure_user_profile_columns,
        seed_initial_data_if_needed,
    )
    from src.models.reconciliation import ReconciliationCase

    Base.metadata.create_all(bind=engine)
    ensure_user_profile_columns()
    ensure_uploaded_file_storage_columns()
    ensure_document_batch_tables()
    ensure_uploaded_document_extraction_tables()
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
    # Optionally drop all here: Base.metadata.drop_all(bind=engine)


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


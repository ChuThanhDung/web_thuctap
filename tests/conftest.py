from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture(scope="session", autouse=True)
def init_db():
    from src.database import Base, engine
    from src.main import ensure_user_profile_columns, seed_initial_data_if_needed
    Base.metadata.create_all(bind=engine)
    ensure_user_profile_columns()
    seed_initial_data_if_needed()
    yield
    # Optionally drop all here: Base.metadata.drop_all(bind=engine)

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

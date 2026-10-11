import pytest

from src.config import get_settings


@pytest.mark.asyncio
async def test_root(client):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


async def auth_headers(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "accountant@docusync.ai", "password": "123456"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_chat_requires_authentication(client):
    response = await client.post("/api/v1/chat", json={"message": "hello"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_agent_status_requires_authentication(client):
    response = await client.get("/api/v1/status")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_agent_endpoints_are_disabled_by_default(client):
    headers = await auth_headers(client)
    assert (await client.get("/api/v1/status", headers=headers)).status_code == 404
    assert (await client.post("/api/v1/chat", json={"message": "hi"}, headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_chat_empty_message(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "enable_agent_chat_api", True)
    response = await client.post("/api/v1/chat", json={"message": ""}, headers=await auth_headers(client))
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_agent_status(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "enable_agent_chat_api", True)
    response = await client.get("/api/v1/status", headers=await auth_headers(client))
    assert response.status_code == 200

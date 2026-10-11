import json
import logging

import pytest

from src.logging_config import JsonFormatter, request_id_var

pytestmark = pytest.mark.asyncio


async def test_response_carries_generated_request_id(client):
    response = await client.get("/")
    assert len(response.headers["X-Request-ID"]) >= 16


async def test_incoming_request_id_is_propagated(client):
    response = await client.get("/", headers={"X-Request-ID": "trace-abc-123"})
    assert response.headers["X-Request-ID"] == "trace-abc-123"


async def test_readiness_reports_database_up(client):
    response = await client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up"}


async def test_readiness_returns_503_when_database_is_down(client, monkeypatch):
    class BrokenEngine:
        def connect(self):
            raise RuntimeError("db down")

    monkeypatch.setattr("src.main.engine", BrokenEngine())
    response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["database"] == "down"


async def test_json_formatter_includes_request_id_and_fields():
    token = request_id_var.set("req-1")
    try:
        record = logging.LogRecord("app.access", logging.INFO, __file__, 1, "GET /x -> 200", None, None)
        record.request_id = request_id_var.get()
        record.status = 200
        payload = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(token)
    assert payload["request_id"] == "req-1"
    assert payload["status"] == 200
    assert payload["level"] == "INFO"

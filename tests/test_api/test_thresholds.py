import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete

from src.models.audit_log import AuditLog
from src.models.reconciliation import Threshold

pytestmark = pytest.mark.asyncio


async def login(client, email):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": "123456"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest_asyncio.fixture
async def chief(client):
    return await login(client, "chief.accountant@docusync.ai")


@pytest_asyncio.fixture
async def accountant(client):
    return await login(client, "accountant@docusync.ai")


@pytest.fixture
def category():
    return f"QA rule {uuid.uuid4().hex[:8]}"


@pytest.fixture(autouse=True)
def cleanup(db_session):
    yield
    db_session.rollback()
    db_session.execute(delete(Threshold).where(Threshold.category.like("QA rule %")))
    db_session.execute(delete(AuditLog).where(AuditLog.details["category"].astext.like("QA rule %")))
    db_session.commit()


async def test_everyone_can_list_but_only_chief_can_change(client, accountant, category):
    assert (await client.get("/api/v1/thresholds", headers=accountant)).status_code == 200
    body = {"category": category, "percent_threshold": "1.5", "absolute_threshold": "1000"}
    assert (await client.post("/api/v1/thresholds", json=body, headers=accountant)).status_code == 403
    assert (await client.put(f"/api/v1/thresholds/{uuid.uuid4()}", json=body, headers=accountant)).status_code == 403
    assert (await client.delete(f"/api/v1/thresholds/{uuid.uuid4()}", headers=accountant)).status_code == 403


async def test_threshold_crud_by_chief(client, chief, category):
    body = {"category": category, "percent_threshold": "1.5", "absolute_threshold": "1000"}
    created = await client.post("/api/v1/thresholds", json=body, headers=chief)
    assert created.status_code == 201
    threshold_id = created.json()["id"]

    duplicate = await client.post("/api/v1/thresholds", json=body, headers=chief)
    assert duplicate.status_code == 409

    updated = await client.put(
        f"/api/v1/thresholds/{threshold_id}",
        json={"percent_threshold": "2.5", "absolute_threshold": "2000"},
        headers=chief,
    )
    assert updated.status_code == 200
    assert float(updated.json()["percent_threshold"]) == 2.5

    assert (await client.delete(f"/api/v1/thresholds/{threshold_id}", headers=chief)).status_code == 204
    assert (await client.delete(f"/api/v1/thresholds/{threshold_id}", headers=chief)).status_code == 404


async def test_threshold_validation(client, chief, category):
    too_high = {"category": category, "percent_threshold": "150", "absolute_threshold": "1"}
    assert (await client.post("/api/v1/thresholds", json=too_high, headers=chief)).status_code == 422
    negative = {"category": category, "percent_threshold": "1", "absolute_threshold": "-5"}
    assert (await client.post("/api/v1/thresholds", json=negative, headers=chief)).status_code == 422
    body = {"percent_threshold": "1", "absolute_threshold": "1"}
    assert (await client.put("/api/v1/thresholds/not-a-uuid", json=body, headers=chief)).status_code == 400

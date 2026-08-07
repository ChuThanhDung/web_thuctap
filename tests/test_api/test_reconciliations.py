import pytest
from fastapi import Depends
from sqlalchemy.orm import Session
from src.main import app
from src.api.auth import get_current_user
from src.database import get_db
from src.models.user import User
from src.models.audit_log import AuditLog
from src.models.reconciliation import ReconciliationCase

def override_get_current_chief_user(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "chief.accountant@docusync.ai").first()
    return user

@pytest.fixture(autouse=True)
def auth_override():
    app.dependency_overrides[get_current_user] = override_get_current_chief_user
    yield
    app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.asyncio
async def test_decide_case_by_case_number_and_uuid(client, db_session):
    # Fetch a case from database
    case = db_session.query(ReconciliationCase).first()
    assert case is not None, "A seed ReconciliationCase must exist in test database"

    case_number = case.case_number
    case_uuid = str(case.id)

    # 1. Test decision 'approved' using case_number
    res_approve = await client.post(
        f"/api/v1/reconciliations/{case_number}/decide",
        json={"decision": "approved"}
    )
    assert res_approve.status_code == 200
    data_approve = res_approve.json()
    assert data_approve["decision"] == "approved"

    # Verify audit log was recorded for CASE_APPROVED
    log_approved = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "CASE_APPROVED")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert log_approved is not None
    assert log_approved.details["case_number"] == case_number
    assert log_approved.target_type == "RECONCILIATION_CASE"
    assert log_approved.target_id == case_uuid

    # 2. Test decision 'approved' (or 'rejected') using UUID string
    res_uuid = await client.post(
        f"/api/v1/reconciliations/{case_uuid}/decide",
        json={"decision": "rejected", "note": "Test rejection note"}
    )
    assert res_uuid.status_code == 200
    data_uuid = res_uuid.json()
    assert data_uuid["decision"] == "rejected"
    assert data_uuid["rejection_note"] == "Test rejection note"

    # Verify audit log was recorded for CASE_REJECTED
    log_rejected = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "CASE_REJECTED")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert log_rejected is not None
    assert log_rejected.details["case_number"] == case_number
    assert log_rejected.target_type == "RECONCILIATION_CASE"
    assert log_rejected.target_id == case_uuid

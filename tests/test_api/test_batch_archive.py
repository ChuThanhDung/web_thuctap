"""Bộ chứng từ (PO + GRN + Invoice) đã qua hai lần duyệt phải được lưu lại, xem lại được và không bị sửa/xóa."""

from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from src.models.reconciliation import DocumentBatch, UploadedFile
from tests.conftest import purge_batch_tables

pytestmark = pytest.mark.asyncio

DATASET = Path(__file__).resolve().parents[2] / "dataset" / "xml" / "batch_01_match"
FILES = {"po": "01_purchase_order.xml", "grn": "02_goods_receipt.xml", "invoice": "03_invoice.xml"}


async def login(client, email):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": "123456"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest_asyncio.fixture
async def accountant(client):
    return await login(client, "accountant@docusync.ai")


@pytest_asyncio.fixture
async def chief(client):
    return await login(client, "chief.accountant@docusync.ai")


@pytest.fixture(autouse=True)
def clean_batches(db_session):
    purge_batch_tables(db_session)
    yield
    db_session.rollback()
    purge_batch_tables(db_session)


async def upload(client, headers, doc_type, batch_id=None):
    data = {"doc_type": doc_type}
    if batch_id is not None:
        data["batch_id"] = str(batch_id)
    return await client.post(
        "/api/v1/uploads",
        files={"file": (FILES[doc_type], (DATASET / FILES[doc_type]).read_bytes(), "application/xml")},
        data=data,
        headers=headers,
    )


@pytest_asyncio.fixture
async def final_approved_batch(client, accountant, chief):
    """Một bộ đầy đủ đã qua kế toán viên duyệt rồi kế toán trưởng duyệt cuối."""
    first = await upload(client, accountant, "po")
    assert first.status_code == 200, first.text
    batch_id = first.json()["batch_id"]
    for doc_type in ("grn", "invoice"):
        assert (await upload(client, accountant, doc_type, batch_id)).status_code == 200

    approved = await client.post(f"/api/v1/uploads/batches/{batch_id}/approve", headers=accountant)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    final = await client.post(f"/api/v1/uploads/batches/{batch_id}/final-approve", headers=chief)
    assert final.status_code == 200, final.text
    assert final.json()["status"] == "final_approved"
    return batch_id


def find_batch(listing, batch_id):
    return next((item for item in listing.json()["items"] if item["id"] == batch_id), None)


async def test_final_approved_batch_is_kept_and_listed_for_both_roles(client, accountant, chief, final_approved_batch):
    for headers in (accountant, chief):
        listing = await client.get("/api/v1/uploads/batches", headers=headers)
        batch = find_batch(listing, final_approved_batch)
        assert batch is not None
        assert batch["status"] == "final_approved"
        assert {f["doc_type"] for f in batch["files"]} == {"po", "grn", "invoice"}
        assert batch["approved_by_name"] and batch["chief_approved_by_name"]


async def test_original_files_remain_viewable_after_final_approval(client, chief, final_approved_batch):
    listing = await client.get("/api/v1/uploads/batches", headers=chief)
    batch = find_batch(listing, final_approved_batch)
    for file in batch["files"]:
        response = await client.get(f"/api/v1/uploads/{file['id']}/file", headers=chief)
        assert response.status_code == 200
        assert response.content == (DATASET / FILES[file["doc_type"]]).read_bytes()


async def test_final_approved_batch_has_reconciliation_result_and_audit_trail(
    client, chief, final_approved_batch, db_session
):
    actions = {
        row[0]
        for row in db_session.execute(
            text("SELECT action FROM audit_logs WHERE target_type = 'DOCUMENT_BATCH' AND target_id = :id"),
            {"id": str(final_approved_batch)},
        )
    }
    assert {"DOCUMENT_BATCH_APPROVED", "DOCUMENT_BATCH_FINAL_APPROVED"} <= actions

    cases = await client.get("/api/v1/reconciliations", headers=chief)
    assert cases.status_code == 200
    assert any(item["status"] == "matched" for item in cases.json()["items"])


async def test_cannot_add_files_to_an_approved_batch(client, accountant, final_approved_batch):
    response = await upload(client, accountant, "po", final_approved_batch)
    assert response.status_code == 409


async def test_cannot_delete_files_batch_or_note_of_a_final_approved_batch(
    client, accountant, chief, final_approved_batch, db_session
):
    file_id = db_session.query(UploadedFile).filter_by(batch_id=final_approved_batch).first().id

    for headers in (accountant, chief):
        assert (await client.delete(f"/api/v1/uploads/{file_id}", headers=headers)).status_code == 409
        assert (await client.delete(f"/api/v1/uploads/batches/{final_approved_batch}", headers=headers)).status_code == 409
        note = await client.patch(
            f"/api/v1/uploads/batches/{final_approved_batch}", json={"note": "sửa sau khi duyệt"}, headers=headers
        )
        assert note.status_code == 409

    assert db_session.query(UploadedFile).filter_by(batch_id=final_approved_batch).count() == 3


async def test_final_approved_batch_cannot_be_rejected_to_reopen_it(client, chief, final_approved_batch):
    response = await client.post(
        f"/api/v1/uploads/batches/{final_approved_batch}/reject", json={"rejection_note": "Cần xem lại."}, headers=chief
    )
    assert response.status_code == 409


async def test_database_refuses_to_delete_final_approved_data_even_with_raw_sql(final_approved_batch, db_session):
    for statement in (
        "DELETE FROM uploaded_files WHERE batch_id = :id",
        "DELETE FROM uploaded_document_extractions WHERE batch_id = :id",
        "DELETE FROM document_batches WHERE id = :id",
    ):
        with pytest.raises(DBAPIError):
            db_session.execute(text(statement), {"id": final_approved_batch})
        db_session.rollback()

    assert db_session.get(DocumentBatch, final_approved_batch) is not None
    assert db_session.query(UploadedFile).filter_by(batch_id=final_approved_batch).count() == 3


async def test_deletion_is_allowed_for_batches_that_are_not_final_approved(client, accountant, db_session):
    first = await upload(client, accountant, "po")
    batch_id = first.json()["batch_id"]
    file_id = first.json()["id"]

    assert (await client.delete(f"/api/v1/uploads/{file_id}", headers=accountant)).status_code == 200
    assert (await client.delete(f"/api/v1/uploads/batches/{batch_id}", headers=accountant)).status_code == 200

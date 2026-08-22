from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import Depends
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.api.uploads import PROJECT_ROOT, build_cloud_storage_key
from src.config import get_settings
from src.database import get_db
from src.main import app
from src.models.reconciliation import DocumentBatch, ReconciliationCase, UploadedFile
from src.models.user import User
from src.services.document_ai_extractor import DocumentAiAnalysis


def assert_stored_filename(data, doc_type, file_ext):
    date_part = datetime.now().strftime("%d_%m_%Y")
    stored_filename = data["stored_filename"]
    assert stored_filename.startswith(f"{doc_type}_{date_part}_")
    assert stored_filename.endswith(f".{file_ext}")
    sequence = stored_filename.removesuffix(f".{file_ext}").split("_")[-1]
    assert sequence.isdigit()
    assert len(sequence) == 2


def assert_cloud_storage_key(key, doc_type, file_ext):
    date_part = datetime.now().strftime("%d_%m_%Y")
    date_path = datetime.now().strftime("%Y/%m/%d")
    stored_filename = Path(key).name
    assert key.startswith(f"uploads/{doc_type}/{date_path}/")
    assert stored_filename.startswith(f"{doc_type}_{date_part}_")
    assert stored_filename.endswith(f".{file_ext}")
    sequence = stored_filename.removesuffix(f".{file_ext}").split("_")[-1]
    assert sequence.isdigit()
    assert len(sequence) == 2


def override_get_current_user(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "accountant@docusync.ai").first()
    return user


def override_get_chief_user(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "chief.accountant@docusync.ai").first()
    return user


@pytest.fixture(autouse=True)
def auth_override():
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def clean_db_fixture(db_session):
    from src.main import ensure_uploaded_document_extraction_tables
    from src.models.reconciliation import DocumentBatch, UploadedDocumentExtraction, UploadedFile

    ensure_uploaded_document_extraction_tables()
    db_session.query(UploadedDocumentExtraction).delete()
    db_session.query(UploadedFile).delete()
    db_session.query(DocumentBatch).delete()
    db_session.commit()


@pytest.mark.asyncio
async def test_list_uploads_empty(client):
    response = await client.get("/api/v1/uploads")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_upload_valid_invoice(client):
    response = await client.post(
        "/api/v1/uploads",
        files={"file": ("INV_0000001.xml", b"<Invoice></Invoice>", "text/xml")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["progress"] == 100
    assert data["case_id"] is None
    assert data["uploaded_by_id"] is not None
    assert data["original_filename"] is None
    assert_stored_filename(data, "invoice", "xml")
    assert data["storage_provider"] == "local"
    assert data["storage_key"].startswith("storage/upload/invoice/")
    assert data["file_url"] == f"/api/v1/uploads/{data['id']}/file"
    assert Path(PROJECT_ROOT / data["storage_key"]).exists()


@pytest.mark.asyncio
async def test_upload_invalid_xml_still_saves_file(client):
    response = await client.post(
        "/api/v1/uploads",
        files={"file": ("bad_file.xml", b"<InvalidXML>missing_close_tag", "text/xml")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["error_message"] is None
    assert data["uploaded_by_id"] is not None
    assert_stored_filename(data, "invoice", "xml")
    assert data["storage_key"].startswith("storage/upload/invoice/")
    assert Path(PROJECT_ROOT / data["storage_key"]).exists()


@pytest.mark.asyncio
async def test_upload_pdf_invoice_only_stores_file(client):
    pdf_content = b"%PDF-1.4 mock content"

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "invoice"},
        files={"file": ("INV_0000002.pdf", pdf_content, "application/pdf")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["case_id"] is None
    assert data["uploaded_by_id"] is not None
    assert data["original_filename"] is None
    assert data["file_ext"] == "pdf"
    assert_stored_filename(data, "invoice", "pdf")
    assert data["storage_key"].startswith("storage/upload/invoice/")
    assert Path(PROJECT_ROOT / data["storage_key"]).exists()


@pytest.mark.asyncio
async def test_uploaded_file_can_be_opened_from_file_url(client):
    pdf_content = b"%PDF-1.4 mock content"
    upload_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "invoice"},
        files={"file": ("INV_0000003.pdf", pdf_content, "application/pdf")},
    )

    assert upload_response.status_code == 200
    data = upload_response.json()

    file_response = await client.get(data["file_url"])

    assert file_response.status_code == 200
    assert file_response.content == pdf_content
    assert file_response.headers["content-type"].startswith("application/pdf")
    assert "inline" in file_response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_uploaded_file_can_be_deleted_and_removed_from_batch(client):
    batch = (await client.post("/api/v1/uploads/batches")).json()
    upload_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po", "batch_id": str(batch["id"])},
        files={"file": ("PO-DELETE.pdf", b"%PDF-1.4 delete me", "application/pdf")},
    )

    assert upload_response.status_code == 200
    upload = upload_response.json()
    file_path = PROJECT_ROOT / upload["storage_key"]
    assert file_path.exists()

    delete_response = await client.delete(f"/api/v1/uploads/{upload['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Đã xóa file đã tải lên."
    assert not file_path.exists()

    file_response = await client.get(upload["file_url"])
    assert file_response.status_code == 404

    batches_response = await client.get("/api/v1/uploads/batches")
    selected = next(item for item in batches_response.json()["items"] if item["id"] == batch["id"])
    assert selected["status"] == "incomplete"
    assert selected["uploaded_doc_types"] == []
    assert selected["missing_doc_types"] == ["po", "invoice", "grn"]
    assert selected["files"] == []


@pytest.mark.asyncio
async def test_empty_upload_batch_can_be_deleted(client, db_session):
    batch = (await client.post("/api/v1/uploads/batches")).json()

    delete_response = await client.delete(f"/api/v1/uploads/batches/{batch['id']}")

    assert delete_response.status_code == 200
    assert db_session.get(DocumentBatch, batch["id"]) is None


@pytest.mark.asyncio
async def test_upload_batch_with_files_cannot_be_deleted(client, db_session):
    batch = (await client.post("/api/v1/uploads/batches")).json()
    upload_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po", "batch_id": str(batch["id"])},
        files={"file": ("PO-KEEP.pdf", b"%PDF-1.4 keep me", "application/pdf")},
    )
    assert upload_response.status_code == 200

    delete_response = await client.delete(f"/api/v1/uploads/batches/{batch['id']}")

    assert delete_response.status_code == 409
    assert db_session.get(DocumentBatch, batch["id"]) is not None


@pytest.mark.asyncio
async def test_uploaded_xml_file_can_be_opened_inline(client):
    xml_content = b'<?xml version="1.0" encoding="UTF-8"?><Invoice><No>INV-1</No></Invoice>'
    upload_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "invoice"},
        files={"file": ("INV_0000004.xml", xml_content, "application/octet-stream")},
    )

    assert upload_response.status_code == 200
    data = upload_response.json()

    file_response = await client.get(data["file_url"])

    assert file_response.status_code == 200
    assert file_response.content == xml_content
    assert file_response.headers["content-type"].startswith("application/xml")
    assert "inline" in file_response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_uploaded_image_file_can_be_opened_inline(client):
    png_content = b"\x89PNG\r\n\x1a\n mock png content"
    upload_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("PO-2026-999992.png", png_content, "application/octet-stream")},
    )

    assert upload_response.status_code == 200
    data = upload_response.json()

    file_response = await client.get(data["file_url"])

    assert file_response.status_code == 200
    assert file_response.content == png_content
    assert file_response.headers["content-type"].startswith("image/png")
    assert "inline" in file_response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_uploaded_cloud_file_can_be_opened_without_redirect(client, db_session, monkeypatch):
    pdf_content = b"%PDF-1.4 mock cloud content"
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_provider", "r2")
    monkeypatch.setattr(
        "src.api.uploads.download_file_from_object_storage",
        lambda storage_key: (pdf_content, "application/pdf"),
    )

    user = db_session.query(User).filter(User.email == "accountant@docusync.ai").first()
    upload = UploadedFile(
        uploaded_by_id=user.public_id,
        storage_key="uploads/invoice/2026/08/10/invoice_10_08_2026_01.pdf",
    )
    db_session.add(upload)
    db_session.commit()

    file_response = await client.get(f"/api/v1/uploads/{upload.id}/file")

    assert file_response.status_code == 200
    assert file_response.content == pdf_content
    assert file_response.headers["content-type"].startswith("application/pdf")
    assert "inline" in file_response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_uploaded_cloud_xml_file_uses_viewable_content_type(client, db_session, monkeypatch):
    xml_content = b"<Invoice><No>INV-CLOUD-1</No></Invoice>"
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_provider", "r2")
    monkeypatch.setattr(
        "src.api.uploads.download_file_from_object_storage",
        lambda storage_key: (xml_content, "application/octet-stream"),
    )

    user = db_session.query(User).filter(User.email == "accountant@docusync.ai").first()
    upload = UploadedFile(
        uploaded_by_id=user.public_id,
        storage_key="uploads/invoice/2026/08/10/invoice_10_08_2026_01.xml",
    )
    db_session.add(upload)
    db_session.commit()

    file_response = await client.get(f"/api/v1/uploads/{upload.id}/file")

    assert file_response.status_code == 200
    assert file_response.content == xml_content
    assert file_response.headers["content-type"].startswith("application/xml")
    assert "inline" in file_response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_upload_po_png_only_stores_file(client):
    png_content = b"\x89PNG\r\n\x1a\n mock png content"

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("PO-2026-999991.png", png_content, "image/png")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["error_message"] is None
    assert data["uploaded_by_id"] is not None
    assert data["original_filename"] is None
    assert data["file_ext"] == "png"
    assert_stored_filename(data, "po", "png")
    assert data["storage_key"].startswith("storage/upload/po/")
    assert Path(PROJECT_ROOT / data["storage_key"]).exists()


@pytest.mark.asyncio
async def test_upload_selected_type_controls_storage_folder(client):
    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("INV_0000001.xml", b"<Invoice></Invoice>", "text/xml")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["error_message"] is None
    assert data["uploaded_by_id"] is not None
    assert data["original_filename"] is None
    assert_stored_filename(data, "po", "xml")
    assert data["storage_key"].startswith("storage/upload/po/")
    assert Path(PROJECT_ROOT / data["storage_key"]).exists()


@pytest.mark.asyncio
async def test_upload_saves_file_when_ai_detects_different_doc_type(client, db_session, monkeypatch):
    def fake_analyze_uploaded_document(content, filename, content_type, expected_doc_type):
        return DocumentAiAnalysis(
            expected_doc_type=expected_doc_type,
            detected_doc_type="invoice",
            is_correct_type=False,
            confidence=Decimal("0.9600"),
            status="wrong_doc_type",
            validation_message="File nay la Hoa don, khong phai Don dat hang.",
            model_name="test-model",
            extracted_data={"type": "invoice", "invoice_number": "INV-TEST"},
            raw_response={"detected_doc_type": "invoice"},
        )

    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", fake_analyze_uploaded_document)

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("invoice-uploaded-as-po.pdf", b"%PDF-1.4 invoice", "application/pdf")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["doc_type"] == "po"
    assert data["ai_extraction"]["expected_doc_type"] == "po"
    assert data["ai_extraction"]["detected_doc_type"] == "invoice"
    assert data["ai_extraction"]["is_correct_type"] is False
    assert db_session.query(UploadedFile).count() == 1


@pytest.mark.asyncio
async def test_upload_batches_group_files_and_track_missing_documents(client):
    batch_response = await client.post("/api/v1/uploads/batches")
    assert batch_response.status_code == 200
    batch = batch_response.json()
    assert batch["batch_number"].startswith(f"BATCH_{datetime.now().strftime('%d_%m_%Y')}_")
    assert batch["batch_number"].split("_")[-1].isdigit()
    assert len(batch["batch_number"].split("_")[-1]) == 2
    assert batch["note"] is None
    assert batch["status"] == "incomplete"
    assert batch["missing_doc_types"] == ["po", "invoice", "grn"]

    po_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po", "batch_id": str(batch["id"])},
        files={"file": ("PO-2026-1.pdf", b"%PDF-1.4 po", "application/pdf")},
    )
    assert po_response.status_code == 200
    po_file = po_response.json()
    assert po_file["batch_id"] == batch["id"]
    assert po_file["doc_type"] == "po"
    assert_stored_filename(po_file, "po", "pdf")

    list_response = await client.get("/api/v1/uploads/batches")
    assert list_response.status_code == 200
    batches = list_response.json()["items"]
    selected = next(item for item in batches if item["id"] == batch["id"])
    assert selected["status"] == "incomplete"
    assert selected["uploaded_doc_types"] == ["po"]
    assert selected["missing_doc_types"] == ["invoice", "grn"]
    assert selected["files"][0]["filename"].startswith("po_")


@pytest.mark.asyncio
async def test_upload_batch_note_is_optional_and_updateable(client, db_session):
    batch_response = await client.post("/api/v1/uploads/batches")
    assert batch_response.status_code == 200
    batch = batch_response.json()
    assert batch["note"] is None

    note_response = await client.patch(
        f"/api/v1/uploads/batches/{batch['id']}",
        json={"note": "  Batch đối chiếu hóa đơn công ty A  "},
    )

    assert note_response.status_code == 200
    assert note_response.json()["note"] == "Batch đối chiếu hóa đơn công ty A"
    db_session.expire_all()
    assert db_session.get(DocumentBatch, batch["id"]).note == "Batch đối chiếu hóa đơn công ty A"

    clear_response = await client.patch(f"/api/v1/uploads/batches/{batch['id']}", json={"note": ""})

    assert clear_response.status_code == 200
    assert clear_response.json()["note"] is None


@pytest.mark.asyncio
async def test_chief_accountant_rejects_batch_with_reason(client, db_session):
    user = db_session.query(User).filter(User.email == "accountant@docusync.ai").first()
    batch = DocumentBatch(
        batch_number=f"BATCH_{datetime.now().strftime('%d_%m_%Y')}_99",
        created_by_id=user.public_id,
        approved_by_id=user.public_id,
        status="approved",
    )
    db_session.add(batch)
    db_session.commit()

    app.dependency_overrides[get_current_user] = override_get_chief_user
    try:
        response = await client.post(
            f"/api/v1/uploads/batches/{batch.id}/reject",
            json={"rejection_note": "Sai số lượng GRN so với hóa đơn."},
        )
    finally:
        app.dependency_overrides[get_current_user] = override_get_current_user

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["rejection_note"] == "Sai số lượng GRN so với hóa đơn."
    db_session.expire_all()
    rejected_batch = db_session.get(DocumentBatch, batch.id)
    assert rejected_batch.status == "rejected"
    assert rejected_batch.rejection_note == "Sai số lượng GRN so với hóa đơn."


@pytest.mark.asyncio
async def test_upload_batch_becomes_ready_when_three_doc_types_exist(client):
    batch = (await client.post("/api/v1/uploads/batches")).json()

    for doc_type in ["po", "invoice", "grn"]:
        response = await client.post(
            "/api/v1/uploads",
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (f"{doc_type}.pdf", b"%PDF-1.4 mock", "application/pdf")},
        )
        assert response.status_code == 200

    list_response = await client.get("/api/v1/uploads/batches")
    selected = next(item for item in list_response.json()["items"] if item["id"] == batch["id"])
    assert selected["status"] == "ready"
    assert selected["missing_doc_types"] == []
    assert set(selected["uploaded_doc_types"]) == {"po", "invoice", "grn"}


@pytest.mark.asyncio
async def test_upload_ready_batch_creates_reconciliation_case_with_grn_tax_fallback(client, db_session, monkeypatch):
    def fake_analyze_uploaded_document(content, filename, content_type, expected_doc_type):
        extracted_by_type = {
            "invoice": {
                "type": "invoice",
                "invoice_number": "INV-UPLOAD-TAX",
                "supplier_name": "Test Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 110,
                "vat_rate_pct": 10,
                "line_items": [
                    {
                        "row_index": 1,
                        "item_name": "Steel bolt",
                        "qty": 10,
                        "price": 10,
                        "vat_rate_pct": 10,
                        "amount": 100,
                    }
                ],
            },
            "po": {
                "type": "po",
                "po_number": "PO-UPLOAD-TAX",
                "supplier_name": "Test Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 110,
                "vat_rate_pct": 10,
                "line_items": [
                    {
                        "row_index": 1,
                        "item_name": "Steel bolt",
                        "sku": "BOLT-001",
                        "qty": 10,
                        "price": 10,
                        "vat_rate_pct": 10,
                        "amount": 100,
                    }
                ],
            },
            "grn": {
                "type": "grn",
                "grn_number": "GRN-UPLOAD-TAX",
                "po_number": "PO-UPLOAD-TAX",
                "supplier_name": "Test Supplier",
                "supplier_tax_id": None,
                "total_amount": 100,
                "line_items": [
                    {
                        "row_index": 1,
                        "item_name": "Steel bolt",
                        "sku": "BOLT-001",
                        "qty": 10,
                        "amount": 100,
                    }
                ],
            },
        }
        return DocumentAiAnalysis(
            expected_doc_type=expected_doc_type,
            detected_doc_type=expected_doc_type,
            is_correct_type=True,
            confidence=Decimal("1.0000"),
            status="validated",
            validation_message="OK",
            model_name="test-model",
            extracted_data=extracted_by_type[expected_doc_type],
            raw_response={"detected_doc_type": expected_doc_type},
        )

    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", fake_analyze_uploaded_document)
    batch = (await client.post("/api/v1/uploads/batches")).json()

    for doc_type in ["po", "invoice", "grn"]:
        response = await client.post(
            "/api/v1/uploads",
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (f"{doc_type}.pdf", b"%PDF-1.4 mock", "application/pdf")},
        )
        assert response.status_code == 200

    case = db_session.query(ReconciliationCase).filter_by(invoice_number="INV-UPLOAD-TAX").one()
    assert case.status == "matched"
    assert case.diff_amount == Decimal("0.00")
    assert case.partner_tax_id == "0101234567"
    assert "cộng VAT 10%" in case.ai_note


@pytest.mark.asyncio
async def test_accountant_can_approve_fully_matched_batch(client, db_session, monkeypatch):
    def fake_analyze_uploaded_document(content, filename, content_type, expected_doc_type):
        extracted_by_type = {
            "invoice": {
                "type": "invoice",
                "invoice_number": "INV-APPROVE-MATCH",
                "supplier_name": "Matched Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 100,
                "line_items": [{"row_index": 1, "item_name": "Service", "qty": 10, "price": 10, "amount": 100}],
            },
            "po": {
                "type": "po",
                "po_number": "PO-APPROVE-MATCH",
                "supplier_name": "Matched Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 100,
                "line_items": [{"row_index": 1, "item_name": "Service", "qty": 10, "price": 10, "amount": 100}],
            },
            "grn": {
                "type": "grn",
                "grn_number": "GRN-APPROVE-MATCH",
                "po_number": "PO-APPROVE-MATCH",
                "supplier_name": "Matched Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 100,
                "line_items": [{"row_index": 1, "item_name": "Service", "qty": 10, "amount": 100}],
            },
        }
        return DocumentAiAnalysis(
            expected_doc_type=expected_doc_type,
            detected_doc_type=expected_doc_type,
            is_correct_type=True,
            confidence=Decimal("1.0000"),
            status="validated",
            validation_message="OK",
            model_name="test-model",
            extracted_data=extracted_by_type[expected_doc_type],
            raw_response={"detected_doc_type": expected_doc_type},
        )

    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", fake_analyze_uploaded_document)
    batch = (await client.post("/api/v1/uploads/batches")).json()

    for doc_type in ["po", "invoice", "grn"]:
        response = await client.post(
            "/api/v1/uploads",
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (f"{doc_type}.pdf", b"%PDF-1.4 mock", "application/pdf")},
        )
        assert response.status_code == 200

    approve_response = await client.post(f"/api/v1/uploads/batches/{batch['id']}/approve")

    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"
    db_session.expire_all()
    assert db_session.get(DocumentBatch, batch["id"]).status == "approved"


@pytest.mark.asyncio
async def test_accountant_cannot_approve_batch_that_is_not_fully_matched(client, db_session, monkeypatch):
    def fake_analyze_uploaded_document(content, filename, content_type, expected_doc_type):
        extracted_by_type = {
            "invoice": {
                "type": "invoice",
                "invoice_number": "INV-APPROVE-MISMATCH",
                "supplier_name": "Mismatch Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 100,
                "line_items": [{"row_index": 1, "item_name": "Service", "qty": 10, "price": 10, "amount": 100}],
            },
            "po": {
                "type": "po",
                "po_number": "PO-APPROVE-MISMATCH",
                "supplier_name": "Mismatch Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 100,
                "line_items": [{"row_index": 1, "item_name": "Service", "qty": 10, "price": 10, "amount": 100}],
            },
            "grn": {
                "type": "grn",
                "grn_number": "GRN-APPROVE-MISMATCH",
                "po_number": "PO-APPROVE-MISMATCH",
                "supplier_name": "Mismatch Supplier",
                "supplier_tax_id": "0101234567",
                "total_amount": 80,
                "line_items": [{"row_index": 1, "item_name": "Service", "qty": 8, "amount": 80}],
            },
        }
        return DocumentAiAnalysis(
            expected_doc_type=expected_doc_type,
            detected_doc_type=expected_doc_type,
            is_correct_type=True,
            confidence=Decimal("1.0000"),
            status="validated",
            validation_message="OK",
            model_name="test-model",
            extracted_data=extracted_by_type[expected_doc_type],
            raw_response={"detected_doc_type": expected_doc_type},
        )

    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", fake_analyze_uploaded_document)
    batch = (await client.post("/api/v1/uploads/batches")).json()

    for doc_type in ["po", "invoice", "grn"]:
        response = await client.post(
            "/api/v1/uploads",
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (f"{doc_type}.pdf", b"%PDF-1.4 mock", "application/pdf")},
        )
        assert response.status_code == 200

    approve_response = await client.post(f"/api/v1/uploads/batches/{batch['id']}/approve")

    assert approve_response.status_code == 409
    assert "khớp hoàn toàn" in approve_response.json()["detail"]
    db_session.expire_all()
    assert db_session.get(DocumentBatch, batch["id"]).status == "ready"


def test_build_cloud_storage_key_uses_sequential_filename(monkeypatch):
    today = datetime.now()
    date_part = today.strftime("%d_%m_%Y")
    date_path = today.strftime("%Y/%m/%d")
    existing_keys = [
        f"uploads/invoice/{date_path}/invoice_{date_part}_01.pdf",
        f"uploads/invoice/{date_path}/invoice_{date_part}_02.pdf",
    ]

    monkeypatch.setattr("src.api.uploads.list_object_storage_keys", lambda prefix: existing_keys)

    key = build_cloud_storage_key("INV_0000001.pdf", "invoice")

    assert key == f"uploads/invoice/{date_path}/invoice_{date_part}_03.pdf"
    assert_cloud_storage_key(key, "invoice", "pdf")

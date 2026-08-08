from datetime import datetime
from pathlib import Path

import pytest
from fastapi import Depends
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.api.uploads import PROJECT_ROOT
from src.database import get_db
from src.main import app
from src.models.user import User


def assert_stored_filename(data, doc_type, file_ext):
    date_part = datetime.now().strftime("%d_%m_%Y")
    stored_filename = data["stored_filename"]
    assert stored_filename.startswith(f"{doc_type}_{date_part}_")
    assert stored_filename.endswith(f".{file_ext}")
    assert stored_filename.removesuffix(f".{file_ext}").split("_")[-1].isdigit()


def override_get_current_user(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "accountant@docusync.ai").first()
    return user


@pytest.fixture(autouse=True)
def auth_override():
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def clean_db_fixture(db_session):
    from src.models.reconciliation import UploadedFile

    db_session.query(UploadedFile).delete()
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

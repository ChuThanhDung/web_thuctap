from datetime import datetime
from pathlib import Path

import pytest
from fastapi import Depends
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.api.uploads import PROJECT_ROOT, build_cloud_storage_key
from src.config import get_settings
from src.database import get_db
from src.main import app
from src.models.reconciliation import UploadedFile
from src.models.user import User


def assert_stored_filename(data, doc_type, file_ext):
    date_part = datetime.now().strftime("%d_%m_%Y")
    stored_filename = data["stored_filename"]
    assert stored_filename.startswith(f"{doc_type}_{date_part}_")
    assert stored_filename.endswith(f".{file_ext}")
    assert stored_filename.removesuffix(f".{file_ext}").split("_")[-1].isdigit()


def assert_cloud_storage_key(key, doc_type, file_ext):
    date_part = datetime.now().strftime("%d_%m_%Y")
    date_path = datetime.now().strftime("%Y/%m/%d")
    stored_filename = Path(key).name
    assert key.startswith(f"uploads/{doc_type}/{date_path}/")
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
        storage_key="uploads/invoice/2026/08/10/invoice_10_08_2026_1.pdf",
    )
    db_session.add(upload)
    db_session.commit()

    file_response = await client.get(f"/api/v1/uploads/{upload.id}/file")

    assert file_response.status_code == 200
    assert file_response.content == pdf_content
    assert file_response.headers["content-type"].startswith("application/pdf")
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


def test_build_cloud_storage_key_uses_sequential_filename(monkeypatch):
    today = datetime.now()
    date_part = today.strftime("%d_%m_%Y")
    date_path = today.strftime("%Y/%m/%d")
    existing_keys = [
        f"uploads/invoice/{date_path}/invoice_{date_part}_1.pdf",
        f"uploads/invoice/{date_path}/invoice_{date_part}_2.pdf",
    ]

    monkeypatch.setattr("src.api.uploads.list_object_storage_keys", lambda prefix: existing_keys)

    key = build_cloud_storage_key("INV_0000001.pdf", "invoice")

    assert key == f"uploads/invoice/{date_path}/invoice_{date_part}_3.pdf"
    assert_cloud_storage_key(key, "invoice", "pdf")

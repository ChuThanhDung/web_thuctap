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


def stored_index(data):
    return int(Path(data["stored_filename"]).stem.split("_")[-1])


def assert_stored_filename(data, doc_type, file_ext):
    date_part = datetime.now().strftime("%d_%m_%Y")
    stored_filename = data["stored_filename"]
    assert stored_filename.startswith(f"{doc_type}_{date_part}_")
    assert stored_filename.endswith(f".{file_ext}")
    assert len(Path(stored_filename).stem.split("_")[-1]) == 2


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
    from src.main import ensure_uploaded_document_extraction_tables
    from src.models.reconciliation import UploadedDocumentExtraction, UploadedFile

    ensure_uploaded_document_extraction_tables()
    db_session.query(UploadedDocumentExtraction).delete()
    db_session.query(UploadedFile).delete()
    db_session.commit()


@pytest.mark.asyncio
async def test_upload_png_po_twice_stores_two_files(client):
    png_content = b"\x89PNG\r\n\x1a\n mock png content for PO test"

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("PO_TEST_999999.png", png_content, "image/png")},
    )
    dup_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("PO_TEST_999999.png", png_content, "image/png")},
    )

    assert response.status_code == 200
    assert dup_response.status_code == 200

    first_data = response.json()
    second_data = dup_response.json()
    assert first_data["status"] == "completed"
    assert second_data["status"] == "completed"
    assert_stored_filename(first_data, "po", "png")
    assert_stored_filename(second_data, "po", "png")
    assert stored_index(second_data) == stored_index(first_data) + 1
    assert first_data["storage_key"].startswith("storage/upload/po/")
    assert second_data["storage_key"].startswith("storage/upload/po/")
    assert first_data["storage_key"] != second_data["storage_key"]
    assert Path(PROJECT_ROOT / first_data["storage_key"]).exists()
    assert Path(PROJECT_ROOT / second_data["storage_key"]).exists()


@pytest.mark.asyncio
async def test_upload_pdf_grn_twice_stores_two_files(client):
    pdf_content = b"%PDF-1.4 mock pdf content for GRN test"

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "grn"},
        files={"file": ("GRN_TEST_888888.pdf", pdf_content, "application/pdf")},
    )
    dup_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "grn"},
        files={"file": ("GRN_TEST_888888.pdf", pdf_content, "application/pdf")},
    )

    assert response.status_code == 200
    assert dup_response.status_code == 200

    first_data = response.json()
    second_data = dup_response.json()
    assert first_data["status"] == "completed"
    assert second_data["status"] == "completed"
    assert_stored_filename(first_data, "grn", "pdf")
    assert_stored_filename(second_data, "grn", "pdf")
    assert stored_index(second_data) == stored_index(first_data) + 1
    assert first_data["storage_key"].startswith("storage/upload/grn/")
    assert second_data["storage_key"].startswith("storage/upload/grn/")
    assert first_data["storage_key"] != second_data["storage_key"]
    assert Path(PROJECT_ROOT / first_data["storage_key"]).exists()
    assert Path(PROJECT_ROOT / second_data["storage_key"]).exists()

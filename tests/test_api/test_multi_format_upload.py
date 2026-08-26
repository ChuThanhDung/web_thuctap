import base64
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

VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"
)


def valid_pdf_bytes(label: str = "test") -> bytes:
    return f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>
endobj
% {label}
startxref
0
%%EOF
""".encode()


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
async def test_upload_png_po_duplicate_content_returns_conflict(client):
    png_content = VALID_PNG_BYTES
    batch = (await client.post("/api/v1/uploads/batches")).json()

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po", "batch_id": str(batch["id"])},
        files={"file": ("PO_TEST_999999.png", png_content, "image/png")},
    )
    dup_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po", "batch_id": str(batch["id"])},
        files={"file": ("PO_TEST_999999.png", png_content, "image/png")},
    )

    assert response.status_code == 200
    assert dup_response.status_code == 409

    first_data = response.json()
    assert first_data["status"] == "completed"
    assert_stored_filename(first_data, "po", "png")
    assert first_data["storage_key"].startswith("storage/upload/po/")
    assert Path(PROJECT_ROOT / first_data["storage_key"]).exists()
    assert "đã được tải lên" in dup_response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_pdf_grn_duplicate_content_returns_conflict(client):
    pdf_content = valid_pdf_bytes("duplicate grn")
    batch = (await client.post("/api/v1/uploads/batches")).json()

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "grn", "batch_id": str(batch["id"])},
        files={"file": ("GRN_TEST_888888.pdf", pdf_content, "application/pdf")},
    )
    dup_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "grn", "batch_id": str(batch["id"])},
        files={"file": ("GRN_TEST_888888.pdf", pdf_content, "application/pdf")},
    )

    assert response.status_code == 200
    assert dup_response.status_code == 409

    first_data = response.json()
    assert first_data["status"] == "completed"
    assert_stored_filename(first_data, "grn", "pdf")
    assert first_data["storage_key"].startswith("storage/upload/grn/")
    assert Path(PROJECT_ROOT / first_data["storage_key"]).exists()
    assert "đã được tải lên" in dup_response.json()["detail"]

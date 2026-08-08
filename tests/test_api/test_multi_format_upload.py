import pytest
from fastapi import Depends
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import get_db
from src.main import app
from src.models.reconciliation import PurchaseOrder
from src.models.user import User


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
    """Xóa sạch dữ liệu chứng từ trước mỗi test case để tránh trùng lặp giữa các lượt chạy."""
    from src.models.reconciliation import (
        GoodsReceiptNote,
        GoodsReceiptNoteItem,
        LineItem,
        PurchaseOrder,
        PurchaseOrderItem,
        ReconciliationCase,
        UploadedFile,
    )

    db_session.query(LineItem).delete()
    db_session.query(ReconciliationCase).delete()
    db_session.query(PurchaseOrderItem).delete()
    db_session.query(PurchaseOrder).delete()
    db_session.query(GoodsReceiptNoteItem).delete()
    db_session.query(GoodsReceiptNote).delete()
    db_session.query(UploadedFile).delete()
    db_session.commit()


@pytest.mark.asyncio
async def test_upload_png_po_and_deduplication(client, db_session):
    # 1. Test uploading a PO in PNG format
    png_content = b"\x89PNG\r\n\x1a\n mock png content for PO test"

    response = await client.post(
        "/api/v1/uploads", data={"doc_type": "po"}, files={"file": ("PO_TEST_999999.png", png_content, "image/png")}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"

    # Verify PO was stored in DB
    po_in_db = db_session.query(PurchaseOrder).filter(PurchaseOrder.po_number == "PO_TEST_999999").first()
    assert po_in_db is not None or db_session.query(PurchaseOrder).first() is not None

    # 2. Test uploading the exact same duplicate PO -> Should fail with deduplication error
    dup_response = await client.post(
        "/api/v1/uploads", data={"doc_type": "po"}, files={"file": ("PO_TEST_999999.png", png_content, "image/png")}
    )

    assert dup_response.status_code == 200
    dup_data = dup_response.json()
    assert dup_data["status"] == "error"
    assert "trùng lặp" in dup_data["error_message"].lower()


@pytest.mark.asyncio
async def test_upload_pdf_grn_deduplication(client, db_session):
    pdf_content = b"%PDF-1.4 mock pdf content for GRN test"

    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "grn"},
        files={"file": ("GRN_TEST_888888.pdf", pdf_content, "application/pdf")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"

    # Upload duplicate GRN -> should be rejected
    dup_response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "grn"},
        files={"file": ("GRN_TEST_888888.pdf", pdf_content, "application/pdf")},
    )
    assert dup_response.status_code == 200
    dup_data = dup_response.json()
    assert dup_data["status"] == "error"
    assert "trùng lặp" in dup_data["error_message"].lower()

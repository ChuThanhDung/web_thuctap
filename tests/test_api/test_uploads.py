import os
import uuid
import pytest
from fastapi import Depends
from sqlalchemy.orm import Session
from src.main import app
from src.api.auth import get_current_user
from src.database import get_db
from src.models.user import User

def override_get_current_user(db: Session = Depends(get_db)):
    # Lấy tài khoản kế toán viên đã được seed sẵn trong DB để tránh lỗi khóa ngoại (ForeignKeyViolation)
    user = db.query(User).filter(User.email == "accountant@docusync.ai").first()
    return user

@pytest.fixture(autouse=True)
def auth_override():
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.asyncio
async def test_list_uploads_empty(client):
    """Kiểm tra API lấy danh sách upload queue trả về kết quả."""
    response = await client.get("/api/v1/uploads")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)

@pytest.mark.asyncio
async def test_upload_valid_invoice(client):
    """Kiểm tra API upload hóa đơn thực tế và đối soát tự động."""
    # Tìm file hóa đơn mẫu trong thư mục raw_data
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "raw_data"))
    inv_path = os.path.join(base_dir, "invoice", "INV_0000001.xml")
    
    # Đọc file hóa đơn mẫu
    with open(inv_path, "rb") as f:
        file_content = f.read()

    # Gọi API POST upload
    response = await client.post(
        "/api/v1/uploads",
        files={"file": ("INV_0000001.xml", file_content, "text/xml")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("completed", "processing"), f"Upload failed with error: {data.get('error_message')}"
    
    # Nếu đối soát thành công, sẽ có case_id
    if data["status"] == "completed":
        assert data["case_id"] is not None

@pytest.mark.asyncio
async def test_upload_invalid_xml(client):
    """Kiểm tra API upload xử lý ngoại lệ khi file lỗi."""
    response = await client.post(
        "/api/v1/uploads",
        files={"file": ("bad_file.xml", b"<InvalidXML>missing_close_tag", "text/xml")}
    )
    
    # API sẽ bắt lỗi và trả về bản ghi với status 'error'
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "bad_file.xml"
    assert data["status"] == "error"
    assert data["error_message"] is not None


@pytest.mark.asyncio
async def test_upload_pdf_invoice_fallback(client):
    """Kiểm tra upload hóa đơn dạng PDF và sử dụng Local/Fallback strategy."""
    pdf_content = b"%PDF-1.4 mock content"
    
    # Upload hóa đơn số 1 dưới dạng PDF
    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "invoice"},
        files={"file": ("INV_0000001.pdf", pdf_content, "application/pdf")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("completed", "processing"), f"Failed: {data.get('error_message')}"
    if data["status"] == "completed":
        assert data["case_id"] is not None


@pytest.mark.asyncio
async def test_upload_po_png(client):
    """Kiểm tra upload PO dạng ảnh và sử dụng Local/Fallback strategy."""
    png_content = b"\x89PNG\r\n\x1a\n mock png content"
    
    response = await client.post(
        "/api/v1/uploads",
        data={"doc_type": "po"},
        files={"file": ("PO-2026-000001.png", png_content, "image/png")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["error_message"] is None


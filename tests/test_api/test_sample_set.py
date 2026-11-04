"""Bộ chứng từ mẫu tải về từ trang Tổng quan (frontend/public/bo-mau) phải đọc được và cho kết quả lệch lớn,
để khách mới thấy ngay cách hệ thống chỉ ra chỗ lệch."""

from pathlib import Path

import pytest

from tests.test_api.test_billing_and_limits import login, make_company

SAMPLE_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "bo-mau"
FILES = (("po", "1-don-dat-hang.xml"), ("grn", "2-phieu-nhap-kho.xml"), ("invoice", "3-hoa-don.xml"))


@pytest.mark.asyncio
async def test_public_sample_set_reconciles_as_a_major_difference(client):
    _, _, accountant = make_company(plan="pro")
    headers = await login(client, accountant)
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    for doc_type, name in FILES:
        response = await client.post(
            "/api/v1/uploads",
            headers=headers,
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (name, (SAMPLE_DIR / name).read_bytes(), "application/xml")},
        )
        assert response.status_code == 200, response.text
    items = (await client.get("/api/v1/uploads/batches", headers=headers)).json()["items"]
    result = next(item for item in items if item["id"] == batch["id"])
    assert result["reconciliation_status"] == "major_diff"


def test_sample_files_carry_no_real_company_details():
    for _, name in FILES:
        text = (SAMPLE_DIR / name).read_text(encoding="utf-8")
        assert "DỮ LIỆU THỬ" in text
        assert "GONOW" not in text.upper()

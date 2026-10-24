"""Ngưỡng mặc định: MST, thuế suất, đơn giá, số lượng khớp tuyệt đối; tiền chỉ lệch làm tròn tối đa 1.000 đ."""

from decimal import Decimal

import pytest

from src.services.reconciliation_engine import exceeds_threshold, reconcile_documents

TAX_ID = "0316784251"


def documents(inv_qty=10, inv_price=100_000, grn_qty=10, inv_total_delta=0):
    subtotal = 10 * 100_000
    po = {
        "supplier_tax_id": TAX_ID,
        "vat_rate_pct": 10,
        "total_amount": subtotal * 1.1,
        "line_items": [{"sku": "A1", "item_name": "Hàng A", "qty": 10, "price": 100_000}],
    }
    grn = {
        "supplier_tax_id": TAX_ID,
        "total_amount": grn_qty * 100_000,
        "line_items": [{"sku": "A1", "item_name": "Hàng A", "qty": grn_qty}],
    }
    invoice_subtotal = inv_qty * inv_price
    invoice = {
        "supplier_tax_id": TAX_ID,
        "vat_rate_pct": 10,
        "total_amount": invoice_subtotal * 1.1 + inv_total_delta,
        "line_items": [{"sku": "A1", "item_name": "Hàng A", "qty": inv_qty, "price": inv_price}],
    }
    return invoice, po, grn


def status_of(**kwargs) -> str:
    invoice, po, grn = documents(**kwargs)
    # db=None: không đọc được bảng thresholds nên engine dùng ngưỡng mặc định.
    return reconcile_documents(invoice, po, grn, db=None)["status"]


def test_identical_documents_match():
    assert status_of() == "matched"


@pytest.mark.parametrize("delta", [1, 999, 1000])
def test_rounding_difference_up_to_1000_dong_is_minor(delta):
    assert status_of(inv_total_delta=delta) == "minor_diff"


def test_amount_difference_above_1000_dong_is_major():
    assert status_of(inv_total_delta=1001) == "major_diff"


def test_quantity_off_by_one_is_major():
    assert status_of(grn_qty=9) == "major_diff"


def test_unit_price_off_by_100_dong_is_major():
    assert status_of(inv_price=100_100) == "major_diff"


def test_zero_percent_limit_means_percent_is_not_checked():
    assert not exceeds_threshold(Decimal("500"), Decimal("0.0001"), Decimal("0"), Decimal("1000"))
    assert exceeds_threshold(Decimal("1"), Decimal("0.0001"), Decimal("0"), Decimal("0"))
    # Cấu hình cũ kiểu "1% hoặc 100.000 đ" vẫn giữ nguyên nghĩa: vượt một trong hai là vượt.
    assert exceeds_threshold(Decimal("50000"), Decimal("2"), Decimal("1"), Decimal("100000"))

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.reconciliation import Threshold


def get_threshold_by_category(db: Session, keywords: tuple[str, ...], default: tuple[str, str]) -> tuple[Decimal, Decimal]:
    try:
        thresholds = db.scalars(select(Threshold)).all()
        for threshold in thresholds:
            category = threshold.category.lower()
            if any(keyword.lower() in category for keyword in keywords):
                return Decimal(str(threshold.percent_threshold)), Decimal(str(threshold.absolute_threshold))
    except Exception:
        pass

    return Decimal(default[0]), Decimal(default[1])


def percent_diff(diff: Decimal, base: Decimal) -> Decimal:
    if base <= 0:
        return Decimal("0.0")
    return (diff / base) * 100


def get_threshold_for_item(db: Session, item_name: str) -> tuple[Decimal, Decimal]:
    """Tìm ngưỡng sai số từ DB cho mặt hàng dựa trên tên hàng (category)."""
    try:
        thresholds = db.scalars(select(Threshold)).all()
        # Tìm nhóm khớp theo từ khóa của category
        for t in thresholds:
            if t.category.lower() in item_name.lower():
                return Decimal(str(t.percent_threshold)), Decimal(str(t.absolute_threshold))

        # Tìm category mặc định/khác
        for t in thresholds:
            if "mặc định" in t.category.lower() or "khác" in t.category.lower():
                return Decimal(str(t.percent_threshold)), Decimal(str(t.absolute_threshold))
    except Exception:
        pass

    # Giá trị mặc định nếu DB trống hoặc lỗi
    return Decimal("3.0"), Decimal("100000.0")  # 3% hoặc 100,000 VND


def convert_po_db_to_dict(po_db) -> dict[str, Any]:
    """Chuyển đổi đối tượng DB PurchaseOrder thành dạng dict tương ứng để đối soát."""
    return {
        "type": "po",
        "po_number": po_db.po_number,
        "supplier_name": po_db.supplier_name,
        "supplier_tax_id": po_db.supplier_tax_id,
        "buyer_name": po_db.buyer_name,
        "total_amount": float(po_db.total_amount) if po_db.total_amount else 0.0,
        "line_items": [
            {
                "row_index": getattr(item, "row_index", idx),
                "item_name": item.item_name,
                "sku": item.item_sku,
                "unit": item.unit,
                "qty": float(item.qty) if item.qty else 0.0,
                "price": float(item.unit_price) if item.unit_price else 0.0,
            }
            for idx, item in enumerate(po_db.items, 1)
        ],
    }


def convert_grn_db_to_dict(grn_db) -> dict[str, Any]:
    """Chuyển đổi đối tượng DB GoodsReceiptNote thành dạng dict tương ứng để đối soát."""
    return {
        "type": "grn",
        "grn_number": grn_db.grn_number,
        "po_number": grn_db.po_number,
        "supplier_name": grn_db.supplier_name,
        "supplier_tax_id": grn_db.supplier_tax_id,
        "line_items": [
            {
                "row_index": getattr(item, "row_index", idx),
                "item_name": item.item_name,
                "sku": item.item_sku,
                "unit": item.unit,
                "qty": float(item.qty) if item.qty else 0.0,
            }
            for idx, item in enumerate(grn_db.items, 1)
        ],
    }


def reconcile_documents(
    invoice_data: dict[str, Any], po_data: dict[str, Any], grn_data: dict[str, Any], db: Session
) -> dict[str, Any]:
    """
    Thực hiện đối soát 3 bên giữa Invoice, PO và GRN.
    Trả về cấu trúc dữ liệu để lưu vào ReconciliationCase và LineItems.
    """
    invoice_items = invoice_data.get("line_items", [])
    po_items = po_data.get("line_items", [])
    grn_items = grn_data.get("line_items", [])

    reconciled_lines = []
    all_matched = True
    threshold_exceeded = False
    primary_diff_type = "MATCH"
    discrepancy_details = []
    amount_pct_limit, amount_abs_limit = get_threshold_by_category(
        db,
        ("đơn giá", "tổng tiền", "số tiền", "amount", "price", "mặc định", "khác"),
        ("1.0", "100000.0"),
    )
    qty_pct_limit, qty_abs_limit = get_threshold_by_category(
        db,
        ("số lượng", "quantity", "qty"),
        ("2.0", "5.0"),
    )

    # Đối soát từng dòng hàng của hóa đơn
    for inv_item in invoice_items:
        inv_name = inv_item.get("item_name", "")
        inv_qty = Decimal(str(inv_item.get("qty", 0)))
        inv_price = Decimal(str(inv_item.get("price", 0)))
        vat_rate = inv_item.get("vat_rate_pct", 10)
        unit = inv_item.get("unit", "Cái")

        # Tìm dòng hàng tương ứng trong PO (khớp theo tên sản phẩm)
        po_item = None
        for p_item in po_items:
            if (
                p_item.get("item_name", "").lower() in inv_name.lower()
                or inv_name.lower() in p_item.get("item_name", "").lower()
            ):
                po_item = p_item
                break

        # Tìm dòng hàng tương ứng trong GRN
        grn_item = None
        for g_item in grn_items:
            if (
                g_item.get("item_name", "").lower() in inv_name.lower()
                or inv_name.lower() in g_item.get("item_name", "").lower()
            ):
                grn_item = g_item
                break

        po_qty = Decimal(str(po_item.get("qty", 0))) if po_item else Decimal(0)
        po_price = Decimal(str(po_item.get("price", 0))) if po_item else Decimal(0)
        grn_qty = Decimal(str(grn_item.get("qty", 0))) if grn_item else Decimal(0)
        sku = po_item.get("sku") if po_item else (grn_item.get("sku") if grn_item else None)

        # Kiểm tra chênh lệch dòng hàng
        qty_diff = (inv_qty != po_qty) or (inv_qty != grn_qty) or (po_qty != grn_qty)
        price_diff = inv_price != po_price
        max_qty_diff = max(abs(inv_qty - po_qty), abs(inv_qty - grn_qty), abs(po_qty - grn_qty))
        qty_base = max(inv_qty, po_qty, grn_qty, Decimal("1"))
        qty_diff_pct = percent_diff(max_qty_diff, qty_base)
        qty_exceeded = (max_qty_diff > qty_abs_limit) or (qty_diff_pct > qty_pct_limit)

        unit_price_diff = abs(inv_price - po_price)
        unit_price_pct = percent_diff(unit_price_diff, po_price)
        price_exceeded = (unit_price_diff > amount_abs_limit) or (unit_price_pct > amount_pct_limit)

        diff_type = "MATCH"
        diff_notes = []

        if qty_diff:
            diff_type = "QTY_DIFF"
            all_matched = False
            threshold_exceeded = threshold_exceeded or qty_exceeded
            primary_diff_type = "MISMATCH_QTY"
            qty_level = "vượt ngưỡng" if qty_exceeded else "trong ngưỡng"
            diff_notes.append(
                f"Số lượng lệch: Hóa đơn ({inv_qty}) vs PO ({po_qty}) vs Thực nhận ({grn_qty}) - {qty_level}"
            )

        if price_diff:
            diff_type = "PRICE_DIFF"
            all_matched = False
            threshold_exceeded = threshold_exceeded or price_exceeded
            if primary_diff_type == "MATCH" or primary_diff_type == "MISMATCH_QTY":
                primary_diff_type = "MISMATCH_PRICE"
            price_level = "vượt ngưỡng" if price_exceeded else "trong ngưỡng"
            diff_notes.append(f"Đơn giá lệch: Hóa đơn ({inv_price}) vs PO ({po_price}) - {price_level}")

        diff_note = " · ".join(diff_notes) if diff_notes else "Khớp hoàn toàn"
        if diff_notes:
            discrepancy_details.append(diff_note)

        reconciled_lines.append(
            {
                "row_index": inv_item.get("row_index", 1),
                "item_sku": sku,
                "item_name": inv_name,
                "unit": unit,
                "inv_qty": inv_qty,
                "po_qty": po_qty,
                "grn_qty": grn_qty,
                "inv_unit_price": inv_price,
                "po_unit_price": po_price,
                "vat_rate_pct": vat_rate,
                "diff_type": diff_type,
                "diff_note": diff_note,
            }
        )

    # Tính tổng tiền và chênh lệch
    invoice_total = Decimal(str(invoice_data.get("total_amount", 0)))
    po_total = Decimal(str(po_data.get("total_amount", 0)))
    diff_amount = abs(invoice_total - po_total)

    # Đánh giá trạng thái dựa trên cấu hình ngưỡng chênh lệch
    if all_matched and diff_amount == 0:
        status = "matched"
        risk_level = "low"
        confidence = Decimal("1.00")
        ai_summary = "Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN)."
        ai_recommendation = "Hồ sơ khớp 100%, chuyển kế toán viên duyệt trước khi thanh toán."
        ai_note = "Khớp 3 bên thành công."
    else:
        # Tính tỷ lệ lệch %
        pct_diff = Decimal("0.0")
        if po_total > 0:
            pct_diff = (diff_amount / po_total) * 100

        # Kiểm tra vượt ngưỡng
        is_amount_exceeded = (pct_diff > amount_pct_limit) or (diff_amount > amount_abs_limit)
        is_exceeded = is_amount_exceeded or threshold_exceeded

        if is_exceeded:
            status = "major_diff"
            risk_level = "high"
            ai_recommendation = "Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn."
        else:
            status = "minor_diff"
            risk_level = "medium"
            ai_recommendation = "Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt."

        confidence = Decimal("0.85")
        ai_summary = f"Phát hiện chênh lệch giữa các chứng từ. Chi tiết: {', '.join(discrepancy_details)}"
        ai_note = (
            f"Chênh lệch số tiền: {diff_amount:,} VND ({pct_diff:.2f}%). "
            f"Ngưỡng tiền: {amount_pct_limit}% và {amount_abs_limit:,} VND. "
            f"Ngưỡng số lượng: {qty_pct_limit}% và {qty_abs_limit} đơn vị."
        )

    return {
        "invoice_number": invoice_data.get("invoice_number"),
        "po_number": po_data.get("po_number"),
        "grn_number": grn_data.get("grn_number"),
        "partner_name": invoice_data.get("supplier_name") or po_data.get("supplier_name"),
        "partner_tax_id": invoice_data.get("supplier_tax_id") or po_data.get("supplier_tax_id"),
        "total_amount": invoice_total,
        "status": status,
        "risk_level": risk_level,
        "confidence": confidence,
        "diff_amount": diff_amount,
        "diff_type": primary_diff_type,
        "ai_note": ai_note,
        "ai_summary": ai_summary,
        "ai_recommendation": ai_recommendation,
        "line_items": reconciled_lines,
    }

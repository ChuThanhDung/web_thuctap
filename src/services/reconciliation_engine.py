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


def to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None or value == "":
        return default
    try:
        return Decimal(str(value))
    except Exception:
        return default


def find_matching_item(item_name: str, candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    item_name_lower = item_name.lower()
    for candidate in candidates:
        candidate_name = candidate.get("item_name", "").lower()
        if candidate_name and (candidate_name in item_name_lower or item_name_lower in candidate_name):
            return candidate
    return None


def normalize_tax_id(value: Any) -> str:
    return "".join(char for char in str(value or "") if char.isdigit())


def document_mentions_tax(document: dict[str, Any]) -> bool:
    tax_keys = ("vat_rate_pct", "vat_amount", "tax_rate_pct", "tax_amount", "total_tax_amount")
    if any(document.get(key) not in (None, "", 0, 0.0, "0", "0.0") for key in tax_keys):
        return True

    for item in document.get("line_items", []):
        if any(item.get(key) not in (None, "", 0, 0.0, "0", "0.0") for key in tax_keys):
            return True

    return False


def infer_tax_rate(*documents: dict[str, Any]) -> Decimal:
    for document in documents:
        for key in ("vat_rate_pct", "tax_rate_pct"):
            rate = to_decimal(document.get(key))
            if rate > 0:
                return rate

        for item in document.get("line_items", []):
            for key in ("vat_rate_pct", "tax_rate_pct"):
                rate = to_decimal(item.get(key))
                if rate > 0:
                    return rate

    return Decimal("0")


def get_document_tax_rate(document: dict[str, Any]) -> Decimal:
    for key in ("vat_rate_pct", "tax_rate_pct"):
        rate = to_decimal(document.get(key))
        if rate > 0:
            return rate
    return Decimal("0")


def get_item_tax_rate(item: dict[str, Any] | None, document: dict[str, Any]) -> Decimal:
    if item:
        for key in ("vat_rate_pct", "tax_rate_pct"):
            rate = to_decimal(item.get(key))
            if rate > 0:
                return rate
    return get_document_tax_rate(document)


def get_item_amount(
    item: dict[str, Any] | None,
    fallback_qty: Decimal,
    fallback_price: Decimal,
) -> Decimal:
    if not item:
        return Decimal("0")

    amount = to_decimal(item.get("amount"))
    if amount > 0:
        return amount

    qty = to_decimal(item.get("qty"), fallback_qty)
    price = to_decimal(item.get("price"), fallback_price)
    if qty > 0 and price > 0:
        return qty * price

    return fallback_qty * fallback_price


def calculate_grn_subtotal(
    grn_data: dict[str, Any], po_items: list[dict[str, Any]], invoice_items: list[dict[str, Any]]
) -> Decimal:
    explicit_total = to_decimal(grn_data.get("total_amount"))
    if explicit_total > 0:
        return explicit_total

    total = Decimal("0")
    for grn_item in grn_data.get("line_items", []):
        grn_name = grn_item.get("item_name", "")
        source_item = find_matching_item(grn_name, po_items) or find_matching_item(grn_name, invoice_items)
        if not source_item:
            continue
        total += to_decimal(grn_item.get("qty")) * to_decimal(source_item.get("price"))

    return total


def normalize_grn_total_for_matching(
    grn_data: dict[str, Any],
    po_data: dict[str, Any],
    invoice_data: dict[str, Any],
    po_items: list[dict[str, Any]],
    invoice_items: list[dict[str, Any]],
) -> tuple[Decimal, Decimal, bool]:
    grn_total = calculate_grn_subtotal(grn_data, po_items, invoice_items)
    tax_rate = infer_tax_rate(po_data)
    should_add_tax = grn_total > 0 and tax_rate > 0 and not document_mentions_tax(grn_data)
    if should_add_tax:
        adjusted_total = grn_total * (Decimal("1") + tax_rate / Decimal("100"))
        reference_totals = [
            total
            for total in (
                to_decimal(invoice_data.get("total_amount")),
                to_decimal(po_data.get("total_amount")),
            )
            if total > 0
        ]
        if not reference_totals or calculate_total_diff(*reference_totals, adjusted_total) < calculate_total_diff(
            *reference_totals, grn_total
        ):
            return adjusted_total, tax_rate, True

    return grn_total, tax_rate, False


def calculate_total_diff(*totals: Decimal) -> Decimal:
    comparable_totals = [total for total in totals if total > 0]
    if len(comparable_totals) < 2:
        return Decimal("0")
    return max(comparable_totals) - min(comparable_totals)


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

    invoice_tax_id = normalize_tax_id(invoice_data.get("supplier_tax_id"))
    po_tax_id = normalize_tax_id(po_data.get("supplier_tax_id"))
    grn_tax_id = normalize_tax_id(grn_data.get("supplier_tax_id"))

    if not invoice_tax_id or not po_tax_id or invoice_tax_id != po_tax_id:
        all_matched = False
        threshold_exceeded = True
        primary_diff_type = "MISMATCH_TAX"
        discrepancy_details.append(
            f"Mã số thuế lệch: Hóa đơn ({invoice_data.get('supplier_tax_id') or 'trống'}) vs "
            f"PO ({po_data.get('supplier_tax_id') or 'trống'})"
        )

    if grn_tax_id and invoice_tax_id and grn_tax_id != invoice_tax_id:
        all_matched = False
        threshold_exceeded = True
        primary_diff_type = "MISMATCH_TAX"
        discrepancy_details.append(
            f"Mã số thuế GRN lệch: GRN ({grn_data.get('supplier_tax_id')}) vs "
            f"Hóa đơn/PO ({invoice_data.get('supplier_tax_id') or po_data.get('supplier_tax_id')})"
        )

    invoice_doc_tax_rate = infer_tax_rate(invoice_data)
    po_doc_tax_rate = infer_tax_rate(po_data)
    if invoice_doc_tax_rate != po_doc_tax_rate:
        all_matched = False
        threshold_exceeded = True
        primary_diff_type = "MISMATCH_TAX"
        discrepancy_details.append(f"VAT lệch: Hóa đơn ({invoice_doc_tax_rate}%) vs PO ({po_doc_tax_rate}%)")

    grn_doc_tax_rate = infer_tax_rate(grn_data)
    if grn_doc_tax_rate > 0 and invoice_doc_tax_rate > 0 and grn_doc_tax_rate != invoice_doc_tax_rate:
        all_matched = False
        threshold_exceeded = True
        primary_diff_type = "MISMATCH_TAX"
        discrepancy_details.append(f"VAT GRN lệch: GRN ({grn_doc_tax_rate}%) vs Hóa đơn/PO ({invoice_doc_tax_rate}%)")

    # Đối soát từng dòng hàng của hóa đơn
    for inv_item in invoice_items:
        inv_name = inv_item.get("item_name", "")
        inv_qty = to_decimal(inv_item.get("qty"))
        inv_price = to_decimal(inv_item.get("price"))
        unit = inv_item.get("unit", "Cái")

        # Tìm dòng hàng tương ứng trong PO (khớp theo tên sản phẩm)
        po_item = find_matching_item(inv_name, po_items)

        # Tìm dòng hàng tương ứng trong GRN
        grn_item = find_matching_item(inv_name, grn_items)

        po_qty = to_decimal(po_item.get("qty")) if po_item else Decimal(0)
        po_price = to_decimal(po_item.get("price")) if po_item else Decimal(0)
        grn_qty = to_decimal(grn_item.get("qty")) if grn_item else Decimal(0)
        sku = po_item.get("sku") if po_item else (grn_item.get("sku") if grn_item else None)
        po_vat_rate = get_item_tax_rate(po_item, po_data)
        inv_vat_rate = get_item_tax_rate(inv_item, invoice_data)
        grn_vat_rate = get_item_tax_rate(grn_item, grn_data)
        vat_rate = inv_vat_rate if inv_vat_rate > 0 else po_vat_rate

        # Kiểm tra chênh lệch dòng hàng
        product_diff = po_item is None or grn_item is None
        qty_diff = (inv_qty != po_qty) or (inv_qty != grn_qty) or (po_qty != grn_qty)
        price_diff = inv_price != po_price
        tax_diff = inv_vat_rate != po_vat_rate or (grn_vat_rate > 0 and grn_vat_rate != inv_vat_rate)
        inv_amount = get_item_amount(inv_item, inv_qty, inv_price)
        po_amount = get_item_amount(po_item, po_qty, po_price)
        grn_amount = get_item_amount(grn_item, grn_qty, po_price or inv_price)
        max_amount_diff = calculate_total_diff(inv_amount, po_amount, grn_amount)
        amount_base = max(inv_amount, po_amount, grn_amount, Decimal("1"))
        amount_diff_pct = percent_diff(max_amount_diff, amount_base)
        amount_exceeded = (max_amount_diff > amount_abs_limit) or (amount_diff_pct > amount_pct_limit)
        amount_diff = max_amount_diff > 0
        max_qty_diff = max(abs(inv_qty - po_qty), abs(inv_qty - grn_qty), abs(po_qty - grn_qty))
        qty_base = max(inv_qty, po_qty, grn_qty, Decimal("1"))
        qty_diff_pct = percent_diff(max_qty_diff, qty_base)
        qty_exceeded = (max_qty_diff > qty_abs_limit) or (qty_diff_pct > qty_pct_limit)

        unit_price_diff = abs(inv_price - po_price)
        unit_price_pct = percent_diff(unit_price_diff, po_price)
        price_exceeded = (unit_price_diff > amount_abs_limit) or (unit_price_pct > amount_pct_limit)

        diff_type = "MATCH"
        diff_notes = []

        if product_diff:
            diff_type = "PRODUCT_DIFF"
            all_matched = False
            threshold_exceeded = True
            primary_diff_type = "MISMATCH_QTY"
            diff_notes.append(
                f"Sản phẩm không đủ 3 chứng từ: Hóa đơn ({inv_name}) vs "
                f"PO ({po_item.get('item_name') if po_item else 'không thấy'}) vs "
                f"GRN ({grn_item.get('item_name') if grn_item else 'không thấy'})"
            )

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

        if amount_diff:
            diff_type = "PRICE_DIFF"
            all_matched = False
            threshold_exceeded = threshold_exceeded or amount_exceeded
            if primary_diff_type in ("MATCH", "MISMATCH_QTY"):
                primary_diff_type = "MISMATCH_PRICE"
            amount_level = "vượt ngưỡng" if amount_exceeded else "trong ngưỡng"
            diff_notes.append(
                f"Thành tiền lệch: Hóa đơn ({inv_amount}) vs PO ({po_amount}) vs GRN ({grn_amount}) - {amount_level}"
            )

        if tax_diff:
            diff_type = "TAX_DIFF"
            all_matched = False
            threshold_exceeded = True
            primary_diff_type = "MISMATCH_TAX"
            note = f"VAT lệch: Hóa đơn ({inv_vat_rate}%) vs PO ({po_vat_rate}%)"
            if grn_vat_rate > 0:
                note += f" vs GRN ({grn_vat_rate}%)"
            diff_notes.append(note)

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
    invoice_total = to_decimal(invoice_data.get("total_amount"))
    po_total = to_decimal(po_data.get("total_amount"))
    grn_total_for_matching, grn_tax_rate, grn_tax_adjusted = normalize_grn_total_for_matching(
        grn_data,
        po_data,
        invoice_data,
        po_items,
        invoice_items,
    )
    diff_amount = calculate_total_diff(invoice_total, po_total, grn_total_for_matching)

    # Đánh giá trạng thái dựa trên cấu hình ngưỡng chênh lệch
    if all_matched and diff_amount == 0:
        status = "matched"
        risk_level = "low"
        confidence = Decimal("1.00")
        ai_summary = "Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN)."
        ai_recommendation = "Hồ sơ khớp 100%, chuyển kế toán viên duyệt trước khi thanh toán."
        if grn_tax_adjusted:
            ai_note = (
                f"Khớp 3 bên thành công. GRN không thể hiện thuế nên đã cộng VAT "
                f"{grn_tax_rate}% khi so khớp tổng tiền."
            )
        else:
            ai_note = "Khớp 3 bên thành công."
    else:
        # Tính tỷ lệ lệch %
        pct_diff = Decimal("0.0")
        diff_base = max(po_total, invoice_total, grn_total_for_matching, Decimal("1"))
        if diff_base > 0:
            pct_diff = (diff_amount / diff_base) * 100

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
        if grn_tax_adjusted:
            ai_note += f" GRN không thể hiện thuế nên đã cộng VAT {grn_tax_rate}% trước khi so khớp."

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

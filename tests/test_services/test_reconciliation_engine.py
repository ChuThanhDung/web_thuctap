from decimal import Decimal

from src.services.reconciliation_engine import reconcile_documents


def test_reconcile_adds_invoice_tax_to_grn_total_when_grn_has_no_tax(db_session):
    invoice_data = {
        "type": "invoice",
        "invoice_number": "INV-001",
        "supplier_name": "Test Supplier",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "unit": "PCE",
                "qty": 10,
                "price": 10,
                "vat_rate_pct": 10,
            }
        ],
    }
    po_data = {
        "type": "po",
        "po_number": "PO-001",
        "supplier_name": "Test Supplier",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "sku": "BOLT-001",
                "unit": "PCE",
                "qty": 10,
                "price": 10,
                "vat_rate_pct": 10,
            }
        ],
    }
    grn_data = {
        "type": "grn",
        "grn_number": "GRN-001",
        "po_number": "PO-001",
        "supplier_name": "Test Supplier",
        "supplier_tax_id": "0101234567",
        "total_amount": 100,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "sku": "BOLT-001",
                "unit": "PCE",
                "qty": 10,
            }
        ],
    }

    result = reconcile_documents(invoice_data, po_data, grn_data, db_session)

    assert result["status"] == "matched"
    assert result["diff_amount"] == Decimal("0.0")
    assert "cộng VAT 10%" in result["ai_note"]


def test_reconcile_does_not_add_tax_again_when_grn_total_already_matches(db_session):
    invoice_data = {
        "type": "invoice",
        "invoice_number": "INV-002",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10, "price": 10, "vat_rate_pct": 10}],
    }
    po_data = {
        "type": "po",
        "po_number": "PO-002",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "sku": "BOLT-001",
                "qty": 10,
                "price": 10,
                "vat_rate_pct": 10,
            }
        ],
    }
    grn_data = {
        "type": "grn",
        "grn_number": "GRN-002",
        "po_number": "PO-002",
        "total_amount": 110,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "sku": "BOLT-001", "qty": 10}],
    }

    result = reconcile_documents(invoice_data, po_data, grn_data, db_session)

    assert result["status"] == "matched"
    assert result["diff_amount"] == Decimal("0")
    assert "cộng VAT" not in result["ai_note"]


def test_reconcile_allows_missing_grn_tax_id_when_invoice_and_po_match(db_session):
    invoice_data = {
        "type": "invoice",
        "invoice_number": "INV-003",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "qty": 10,
                "price": 10,
                "vat_rate_pct": 10,
                "amount": 100,
            }
        ],
    }
    po_data = {
        "type": "po",
        "po_number": "PO-003",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "sku": "BOLT-001",
                "qty": 10,
                "price": 10,
                "vat_rate_pct": 10,
                "amount": 100,
            }
        ],
    }
    grn_data = {
        "type": "grn",
        "grn_number": "GRN-003",
        "po_number": "PO-003",
        "supplier_tax_id": None,
        "total_amount": 100,
        "line_items": [
            {
                "row_index": 1,
                "item_name": "Steel bolt",
                "sku": "BOLT-001",
                "qty": 10,
                "amount": 100,
            }
        ],
    }

    result = reconcile_documents(invoice_data, po_data, grn_data, db_session)

    assert result["status"] == "matched"
    assert result["diff_amount"] == Decimal("0.0")


def test_reconcile_rejects_grn_tax_id_when_present_and_mismatched(db_session):
    invoice_data = {
        "type": "invoice",
        "invoice_number": "INV-004",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10, "price": 10, "vat_rate_pct": 10}],
    }
    po_data = {
        "type": "po",
        "po_number": "PO-004",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10, "price": 10, "vat_rate_pct": 10}],
    }
    grn_data = {
        "type": "grn",
        "grn_number": "GRN-004",
        "po_number": "PO-004",
        "supplier_tax_id": "9999999999",
        "total_amount": 100,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10}],
    }

    result = reconcile_documents(invoice_data, po_data, grn_data, db_session)

    assert result["status"] == "major_diff"
    assert result["diff_type"] == "MISMATCH_TAX"
    assert "Mã số thuế GRN lệch" in result["ai_summary"]


def test_reconcile_rejects_invoice_and_po_vat_mismatch(db_session):
    invoice_data = {
        "type": "invoice",
        "invoice_number": "INV-005",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 10,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10, "price": 10, "vat_rate_pct": 10}],
    }
    po_data = {
        "type": "po",
        "po_number": "PO-005",
        "supplier_tax_id": "0101234567",
        "total_amount": 110,
        "vat_rate_pct": 8,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10, "price": 10, "vat_rate_pct": 8}],
    }
    grn_data = {
        "type": "grn",
        "grn_number": "GRN-005",
        "po_number": "PO-005",
        "total_amount": 100,
        "line_items": [{"row_index": 1, "item_name": "Steel bolt", "qty": 10}],
    }

    result = reconcile_documents(invoice_data, po_data, grn_data, db_session)

    assert result["status"] == "major_diff"
    assert result["diff_type"] == "MISMATCH_TAX"
    assert "VAT lệch" in result["ai_summary"]

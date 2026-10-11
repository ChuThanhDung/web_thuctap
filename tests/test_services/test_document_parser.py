from pathlib import Path

import pytest

from src.services.document_parser import detect_and_parse_document, first_element, parse_xml_to_dict
from src.services.reconciliation_engine import reconcile_documents

DATASET = Path(__file__).resolve().parents[2] / "dataset" / "xml"
FILES = {"po": "01_purchase_order.xml", "grn": "02_goods_receipt.xml", "invoice": "03_invoice.xml"}
BATCHES = sorted(p.name for p in DATASET.iterdir() if p.is_dir())


def parse_batch(batch: str) -> dict:
    return {
        kind: detect_and_parse_document((DATASET / batch / name).read_bytes(), name) for kind, name in FILES.items()
    }


def test_first_element_returns_first_existing_leaf_not_a_later_fallback():
    root = parse_xml_to_dict(b"<R><A>1</A><B>2</B></R>")
    assert first_element(root, "A", "B").text == "1"
    assert first_element(root, "Missing", "B").text == "2"
    assert first_element(root, "Missing", "Nope") is None


def test_invoice_nested_leaf_fields_are_not_skipped():
    # Hồi quy: kiểu `a.find(x) or a.find(y)` coi phần tử lá là False nên từng bỏ sót Vendor/Name.
    xml = (
        b"<Invoice><InvoiceNumber>INV-1</InvoiceNumber><Vendor><Name>ACME</Name><TaxCode>0101</TaxCode></Vendor>"
        b"<TotalAmount>100</TotalAmount></Invoice>"
    )
    parsed = detect_and_parse_document(xml)
    assert parsed["invoice_number"] == "INV-1"
    assert parsed["supplier_name"] == "ACME"
    assert parsed["supplier_tax_id"] == "0101"


@pytest.mark.parametrize("batch", BATCHES)
def test_dataset_documents_are_recognised_with_line_items(batch):
    docs = parse_batch(batch)
    assert {docs["po"]["type"], docs["grn"]["type"], docs["invoice"]["type"]} == {"po", "grn", "invoice"}
    for doc in docs.values():
        assert doc["line_items"], doc["type"]
        assert all(item["item_name"] and item["qty"] > 0 for item in doc["line_items"])
    assert docs["grn"]["po_number"] == docs["po"]["po_number"]
    assert docs["invoice"]["supplier_name"] == docs["po"]["supplier_name"]


def test_vietnamese_po_fields():
    po = parse_batch("batch_01_match")["po"]
    assert po["po_number"] == "PO-2026-0142"
    assert po["total_amount"] == 119_240_000
    assert po["line_items"][0]["sku"] == "MBH-CL01"
    assert po["line_items"][0]["unit"] == "Chiếc"
    assert po["line_items"][0]["vat_rate_pct"] == 10


@pytest.mark.parametrize("batch", BATCHES)
def test_dataset_reconciliation_verdict_matches_folder_label(batch, db_session):
    docs = parse_batch(batch)
    result = reconcile_documents(docs["invoice"], docs["po"], docs["grn"], db_session)
    if batch.endswith("_mismatch"):
        assert result["status"] != "matched"
        assert any(line["diff_type"] != "MATCH" for line in result["line_items"])
    else:
        assert result["status"] == "matched"


def test_malformed_xml_is_rejected_with_value_error():
    with pytest.raises(ValueError):
        detect_and_parse_document(b"<HDon><SHDon>1</SHDon>", "broken.xml")


def test_unknown_root_is_rejected_with_value_error():
    with pytest.raises(ValueError):
        detect_and_parse_document(b"<Something><X>1</X></Something>", "x.xml")

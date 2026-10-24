"""Bộ dữ liệu vàng: sinh xác định, đủ độ đa dạng, và engine đối soát cho kết quả đúng như đáp án đã định."""

import importlib.util
import json
from collections import Counter
from pathlib import Path

import pytest

from src.services.document_parser import detect_and_parse_document
from src.services.reconciliation_engine import reconcile_documents

ROOT = Path(__file__).resolve().parent.parent
FILES = {"po": "01_purchase_order.xml", "grn": "02_goods_receipt.xml", "invoice": "03_invoice.xml"}


def load_generator():
    spec = importlib.util.spec_from_file_location(
        "generate_golden_dataset", ROOT / "scripts" / "generate_golden_dataset.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DefaultThresholds:
    """Bảng thresholds trống -> engine dùng ngưỡng mặc định, độc lập với dữ liệu trong DB."""

    def scalars(self, *args, **kwargs):
        return self

    def all(self):
        return []


@pytest.fixture(scope="module")
def golden(tmp_path_factory):
    generator = load_generator()
    out = tmp_path_factory.mktemp("golden")
    generator.write_dataset(out, count=60, seed=20261024)
    return out


def snapshot(folder: Path) -> dict[str, bytes]:
    return {str(path.relative_to(folder)): path.read_bytes() for path in sorted(folder.rglob("*")) if path.is_file()}


def test_generation_is_deterministic(golden, tmp_path):
    load_generator().write_dataset(tmp_path / "again", count=60, seed=20261024)
    assert snapshot(golden) == snapshot(tmp_path / "again")


def test_dataset_covers_sizes_and_failure_kinds(golden):
    manifest = json.loads((golden / "manifest.json").read_text(encoding="utf-8"))["batches"]
    assert len(manifest) == 60
    statuses = Counter(row["expected_status"] for row in manifest)
    assert statuses["matched"] == 30
    assert statuses["major_diff"] > 0 and statuses["minor_diff"] > 0
    assert {row["category"] for row in manifest} == {"small", "medium", "large", "xlarge", "stress"}
    assert min(row["line_count"] for row in manifest) == 1
    assert max(row["line_count"] for row in manifest) >= 800
    kinds = {row["kind"] for row in manifest}
    assert {"price_up_invoice", "qty_over_invoice", "short_delivery", "tax_id_mismatch", "vat_rate_mismatch"} <= kinds
    assert {
        "product_missing_on_grn",
        "extra_product_on_invoice",
        "total_tampered",
        "rounding_vat",
        "rounding_line",
        "short_by_one",
        "price_off_small",
        "tax_over_limit",
    } <= kinds


def test_every_batch_parses_and_reports_the_documented_line_count(golden):
    for folder in sorted(p for p in golden.iterdir() if p.is_dir()):
        truth = json.loads((folder / "ground_truth.json").read_text(encoding="utf-8"))
        po = detect_and_parse_document((folder / FILES["po"]).read_bytes(), FILES["po"])
        assert len(po["line_items"]) == truth["line_count"], folder.name
        assert po["po_number"] == truth["documents"]["purchase_order"]
        assert po["total_amount"] == truth["po_total"]


def test_engine_verdict_matches_the_golden_answer_for_every_batch(golden):
    wrong = []
    for folder in sorted(p for p in golden.iterdir() if p.is_dir()):
        truth = json.loads((folder / "ground_truth.json").read_text(encoding="utf-8"))
        docs = {kind: detect_and_parse_document((folder / name).read_bytes(), name) for kind, name in FILES.items()}
        result = reconcile_documents(docs["invoice"], docs["po"], docs["grn"], DefaultThresholds())
        if result["status"] != truth["expected_status"]:
            wrong.append((folder.name, truth["expected_status"], result["status"]))
    assert wrong == []

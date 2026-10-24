"""Đánh giá pipeline bóc tách XML + đối soát 3 bên trên bộ dữ liệu `dataset/xml`.

Chạy:  python eval/run_eval.py [--json eval/results/metrics.json] [--dataset dataset/golden]
Không gọi LLM/mạng. PDF và ảnh cần Vision API nên KHÔNG nằm trong phạm vi script này.
Nhãn đúng lấy từ tên thư mục (`*_match` / `*_mismatch`) và `ground_truth.json` nếu có.
"""

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.database import SessionLocal  # noqa: E402
from src.services.document_parser import detect_and_parse_document  # noqa: E402
from src.services.reconciliation_engine import reconcile_documents  # noqa: E402

XML_DIR = ROOT / "dataset" / "xml"
CORRUPT_DIR = ROOT / "dataset" / "edge_cases" / "batch_01_corrupt_xml"
FILES = {"po": "01_purchase_order.xml", "grn": "02_goods_receipt.xml", "invoice": "03_invoice.xml"}


class DefaultThresholds:
    """Thay cho Session khi đánh giá: bảng thresholds luôn trống nên engine dùng ngưỡng mặc định (tiền chỉ lệch làm
    tròn tối đa 1.000 đ; đơn giá và số lượng khớp tuyệt đối). Nhờ vậy kết quả không phụ thuộc cấu hình ngưỡng của người dùng trong DB đang chạy."""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def scalars(self, *args, **kwargs):
        return self

    def all(self):
        return []


def parse_batch(batch_dir: Path) -> dict:
    return {kind: detect_and_parse_document((batch_dir / name).read_bytes(), name) for kind, name in FILES.items()}


def percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(pct / 100 * (len(ordered) - 1)))]


def evaluate(xml_dir: Path = XML_DIR, use_db_thresholds: bool = False) -> dict:
    batches = []
    latencies_ms = []

    with SessionLocal() if use_db_thresholds else DefaultThresholds() as db:
        for batch_dir in sorted(p for p in xml_dir.iterdir() if p.is_dir()):
            truth_path = batch_dir / "ground_truth.json"
            truth = json.loads(truth_path.read_text(encoding="utf-8")) if truth_path.exists() else None
            if truth and truth.get("expected_result"):
                expected_mismatch = truth["expected_result"] == "MISMATCH"
            else:
                expected_mismatch = batch_dir.name.endswith("_mismatch")

            started = time.perf_counter()
            try:
                docs = parse_batch(batch_dir)
                result = reconcile_documents(docs["invoice"], docs["po"], docs["grn"], db)
                error = None
            except Exception as exc:  # noqa: BLE001 - đưa lỗi vào báo cáo thay vì dừng đánh giá
                docs, result, error = None, None, str(exc)
            elapsed_ms = (time.perf_counter() - started) * 1000
            latencies_ms.append(elapsed_ms)

            row = {
                "batch": batch_dir.name,
                "expected": "MISMATCH" if expected_mismatch else "MATCH",
                "parsed": error is None,
                "error": error,
                "latency_ms": round(elapsed_ms, 1),
            }
            if result is not None:
                predicted_mismatch = result["status"] != "matched"
                row.update(
                    status=result["status"],
                    predicted="MISMATCH" if predicted_mismatch else "MATCH",
                    verdict_correct=predicted_mismatch == expected_mismatch,
                    flagged_lines=sum(1 for li in result["line_items"] if li["diff_type"] != "MATCH"),
                )
                if truth and truth.get("expected_status"):
                    row.update(
                        expected_status=truth["expected_status"],
                        status_correct=result["status"] == truth["expected_status"],
                        category=truth.get("category"),
                        kind=truth.get("kind"),
                        line_count=truth.get("line_count"),
                    )
            if truth and docs:
                expected_docs = truth["documents"]
                row["numbers_correct"] = (
                    docs["po"]["po_number"] == expected_docs["purchase_order"]
                    and docs["grn"]["grn_number"] == expected_docs["goods_receipt"]
                    and docs["invoice"]["invoice_number"].lstrip("0") in expected_docs["invoice"].replace("-", "")
                )
                row["totals_correct"] = (
                    docs["po"]["total_amount"] == truth["po_total"]
                    and docs["invoice"]["total_amount"] == truth["invoice_total"]
                )
            batches.append(row)

    corrupt = {"recovered": 0, "rejected": 0, "crashed": 0}
    for path in sorted(CORRUPT_DIR.glob("*.xml")):
        try:
            detect_and_parse_document(path.read_bytes(), path.name)
            corrupt["recovered"] += 1  # byte rác bị bỏ qua, dữ liệu vẫn đọc được
        except ValueError:
            corrupt["rejected"] += 1  # từ chối với lỗi có kiểm soát
        except Exception:  # noqa: BLE001
            corrupt["crashed"] += 1

    scored = [b for b in batches if "verdict_correct" in b]
    graded = [b for b in batches if "status_correct" in b]
    by_category: dict[str, dict] = {}
    for b in graded:
        stats = by_category.setdefault(b["category"], {"batches": 0, "status_correct": 0, "latencies": []})
        stats["batches"] += 1
        stats["status_correct"] += b["status_correct"]
        stats["latencies"].append(b["latency_ms"])
    by_category = {
        name: {
            "batches": v["batches"],
            "status_accuracy": round(v["status_correct"] / v["batches"], 3),
            "latency_ms_max": round(max(v["latencies"]), 1),
        }
        for name, v in by_category.items()
    }
    with_truth = [b for b in batches if "numbers_correct" in b]
    return {
        "dataset": "dataset/xml",
        "batches": batches,
        "summary": {
            "batches_total": len(batches),
            "parse_success_rate": sum(b["parsed"] for b in batches) / len(batches),
            "verdict_accuracy": sum(b["verdict_correct"] for b in scored) / len(scored) if scored else None,
            "status_accuracy": sum(b["status_correct"] for b in graded) / len(graded) if graded else None,
            "by_category": by_category,
            "status_mismatches": [
                {"batch": b["batch"], "kind": b["kind"], "expected": b["expected_status"], "actual": b["status"]}
                for b in graded
                if not b["status_correct"]
            ],
            "ground_truth_batches": len(with_truth),
            "document_numbers_accuracy": sum(b["numbers_correct"] for b in with_truth) / len(with_truth)
            if with_truth
            else None,
            "totals_accuracy": sum(b["totals_correct"] for b in with_truth) / len(with_truth) if with_truth else None,
            "corrupt_xml": corrupt,
            "latency_ms_p50": round(statistics.median(latencies_ms), 1),
            "latency_ms_max": round(max(latencies_ms), 1),
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=Path, default=ROOT / "eval" / "results" / "metrics.json")
    parser.add_argument(
        "--db-thresholds",
        action="store_true",
        help="Dùng ngưỡng sai số đang cấu hình trong DB (mặc định: ngưỡng mặc định, để kết quả tái lập được).",
    )
    parser.add_argument("--dataset", type=Path, default=XML_DIR, help="Thư mục chứa các bộ XML (mặc định dataset/xml).")
    parser.add_argument(
        "--min-verdict-accuracy",
        type=float,
        default=None,
        help="Thoát với mã lỗi nếu độ chính xác phán quyết khớp/lệch thấp hơn ngưỡng này (dùng trong CI).",
    )
    args = parser.parse_args()
    report = evaluate(args.dataset, use_db_thresholds=args.db_thresholds)
    report["dataset"] = str(args.dataset)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    for row in report["batches"]:
        print(
            f"{row['batch']:<38} expected={row['expected']:<8} predicted={row.get('predicted', '-'):<8} "
            f"status={row.get('status', row['error'])} flagged={row.get('flagged_lines', '-')} "
            f"nums={row.get('numbers_correct', '-')} totals={row.get('totals_correct', '-')}"
        )
    threshold = args.min_verdict_accuracy
    if threshold is not None and (report["summary"]["verdict_accuracy"] or 0) < threshold:
        print(f"FAIL: verdict_accuracy < {threshold}")
        sys.exit(1)

"""Đánh giá pipeline bóc tách XML + đối soát 3 bên trên bộ dữ liệu `dataset/xml`.

Chạy:  python eval/run_eval.py [--json eval/results/metrics.json]
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


def parse_batch(batch_dir: Path) -> dict:
    return {kind: detect_and_parse_document((batch_dir / name).read_bytes(), name) for kind, name in FILES.items()}


def percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(pct / 100 * (len(ordered) - 1)))]


def evaluate() -> dict:
    batches = []
    latencies_ms = []

    with SessionLocal() as db:
        for batch_dir in sorted(p for p in XML_DIR.iterdir() if p.is_dir()):
            expected_mismatch = batch_dir.name.endswith("_mismatch")
            truth_path = batch_dir / "ground_truth.json"
            truth = json.loads(truth_path.read_text(encoding="utf-8")) if truth_path.exists() else None

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
    with_truth = [b for b in batches if "numbers_correct" in b]
    return {
        "dataset": "dataset/xml",
        "batches": batches,
        "summary": {
            "batches_total": len(batches),
            "parse_success_rate": sum(b["parsed"] for b in batches) / len(batches),
            "verdict_accuracy": sum(b["verdict_correct"] for b in scored) / len(scored) if scored else None,
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
        "--min-verdict-accuracy",
        type=float,
        default=None,
        help="Thoát với mã lỗi nếu độ chính xác phán quyết khớp/lệch thấp hơn ngưỡng này (dùng trong CI).",
    )
    args = parser.parse_args()
    report = evaluate()
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    for row in report["batches"]:
        print(
            f"{row['batch']:<18} expected={row['expected']:<8} predicted={row.get('predicted', '-'):<8} "
            f"status={row.get('status', row['error'])} flagged={row.get('flagged_lines', '-')} "
            f"nums={row.get('numbers_correct', '-')} totals={row.get('totals_correct', '-')}"
        )
    threshold = args.min_verdict_accuracy
    if threshold is not None and (report["summary"]["verdict_accuracy"] or 0) < threshold:
        print(f"FAIL: verdict_accuracy < {threshold}")
        sys.exit(1)

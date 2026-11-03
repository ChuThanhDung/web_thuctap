"""Tải các bộ chứng từ mẫu (PO, GRN, hóa đơn) lên một server qua API và so kết quả với đáp án.

Mỗi thư mục con trong dataset/golden và dataset/xml là một bộ: 01_purchase_order, 02_goods_receipt, 03_invoice
(.xml/.pdf/.jpg) và ground_truth.json (tùy chọn, có `expected_status`). Mỗi bộ thành một bộ đối soát mới,
ghi chú là tên thư mục để dễ tìm và xóa sau.

Dùng:
    python scripts/upload_dataset_sets.py --base-url https://docusyncai.duckdns.org --email ke.toan@vi.du
    python scripts/upload_dataset_sets.py --base-url http://localhost:3000 --email accountant@docusync.ai --limit 1
    python scripts/upload_dataset_sets.py --base-url https://docusyncai.duckdns.org --email ke.toan@vi.du --cleanup

Mật khẩu hỏi khi chạy (hoặc lấy từ UPLOAD_PASSWORD); có thể dùng lại phiên đăng nhập qua UPLOAD_TOKEN. Không lưu lại.
Chỉ tải XML: không gọi AI. Bộ PDF/ảnh sẽ đi qua AI ở server (tốn phí API nếu server có khóa OpenAI).
"""

import argparse
import getpass
import json
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SETS = [ROOT / "dataset" / "golden", ROOT / "dataset" / "xml"]
DOC_TYPES = {"purchase_order": "po", "goods_receipt": "grn", "invoice": "invoice"}
WAIT_SECONDS = 90
NOTE_PREFIX = "Bộ mẫu "


def find_sets(folders: list[Path], formats: set[str]) -> list[Path]:
    sets = []
    for folder in folders:
        for candidate in sorted(p for p in folder.iterdir() if p.is_dir()):
            files = list(candidate.iterdir())
            if any(f.suffix.lower().lstrip(".") in formats and any(k in f.stem for k in DOC_TYPES) for f in files):
                sets.append(candidate)
    return sets


def set_files(folder: Path, formats: set[str]) -> list[tuple[str, Path]]:
    result = []
    for path in sorted(folder.iterdir()):
        if path.suffix.lower().lstrip(".") not in formats:
            continue
        doc_type = next((code for key, code in DOC_TYPES.items() if key in path.stem), None)
        if doc_type:
            result.append((doc_type, path))
    return result


def expected_status(folder: Path) -> str | None:
    truth = folder / "ground_truth.json"
    if not truth.exists():
        return None
    return json.loads(truth.read_text(encoding="utf-8")).get("expected_status")


def main() -> int:
    # Console Windows mặc định cp1252, không in được tiếng Việt.
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", required=True, help="Địa chỉ web, ví dụ https://docusyncai.duckdns.org")
    parser.add_argument("--email", required=True, help="Tài khoản kế toán viên")
    parser.add_argument("--formats", default="xml", help="Định dạng tải lên, cách nhau dấu phẩy (mặc định: xml)")
    parser.add_argument("--limit", type=int, default=0, help="Chỉ tải N bộ đầu (0 = tất cả)")
    parser.add_argument("--sets", nargs="*", type=Path, default=DEFAULT_SETS, help="Thư mục chứa các bộ")
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Không tải gì; xóa các bộ có ghi chú 'Bộ mẫu ...' chưa duyệt (xóa file trước, rồi xóa bộ)",
    )
    args = parser.parse_args()

    formats = {item.strip().lower() for item in args.formats.split(",") if item.strip()}
    sets = find_sets(args.sets, formats)
    if args.limit:
        sets = sets[: args.limit]
    if not sets:
        print("Không tìm thấy bộ chứng từ nào.")
        return 1

    api = args.base_url.rstrip("/") + "/api/v1"
    with httpx.Client(timeout=120) as client:
        # Dùng lại phiên đăng nhập có sẵn (UPLOAD_TOKEN) nếu có; không thì đăng nhập bằng mật khẩu.
        token = os.environ.get("UPLOAD_TOKEN")
        if not token:
            password = os.environ.get("UPLOAD_PASSWORD") or getpass.getpass(f"Mật khẩu cho {args.email}: ")
            login = client.post(f"{api}/auth/login", json={"email": args.email, "password": password})
            if login.status_code != 200:
                print(f"Đăng nhập thất bại ({login.status_code}): {login.text[:200]}")
                return 1
            token = login.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"

        if args.cleanup:
            # API chỉ cho xóa bộ chưa có chứng từ, nên xóa từng file trước. Bộ đã duyệt thì không đụng tới.
            items = client.get(f"{api}/uploads/batches").json().get("items", [])
            targets = [
                item
                for item in items
                if (item.get("note") or "").startswith(NOTE_PREFIX)
                and item["status"] not in ("approved", "final_approved")
            ]
            for item in targets:
                for upload in item.get("files") or []:
                    client.delete(f"{api}/uploads/{upload['id']}")
                code = client.delete(f"{api}/uploads/batches/{item['id']}").status_code
                print(f"Xóa {item['batch_number']} ({item['note']}): {'xong' if code == 200 else code}")
            print(f"Đã xử lý {len(targets)} bộ mẫu.")
            return 0

        uploaded: dict[int, tuple[str, str | None]] = {}
        for index, folder in enumerate(sets, start=1):
            batch = client.post(f"{api}/uploads/batches").json()
            client.patch(f"{api}/uploads/batches/{batch['id']}", json={"note": f"{NOTE_PREFIX}{folder.name}"})
            failures = []
            for doc_type, path in set_files(folder, formats):
                with path.open("rb") as handle:
                    response = client.post(
                        f"{api}/uploads",
                        data={"doc_type": doc_type, "batch_id": str(batch["id"])},
                        files={"file": (path.name, handle)},
                    )
                if response.status_code != 200:
                    failures.append(f"{path.name}: {response.status_code} {response.text[:120]}")
            uploaded[batch["id"]] = (folder.name, expected_status(folder))
            status_text = "lỗi: " + "; ".join(failures) if failures else "đã tải"
            print(f"[{index}/{len(sets)}] {folder.name} -> {batch['batch_number']} ({status_text})")

        # Chờ server trích xuất và đối soát xong rồi đọc kết quả.
        # PDF/ảnh đi qua AI nên chậm hơn XML nhiều.
        deadline = time.time() + (WAIT_SECONDS if formats == {"xml"} else WAIT_SECONDS * 6)
        results: dict[int, dict] = {}
        while time.time() < deadline:
            items = client.get(f"{api}/uploads/batches").json().get("items", [])
            results = {item["id"]: item for item in items if item["id"] in uploaded}
            pending = [item for item in results.values() if item.get("pending_extraction_doc_types")]
            if not pending and len(results) == len(uploaded):
                break
            time.sleep(3)

    print("\nKết quả (đáp án → server):")
    wrong = 0
    for batch_id, (name, expected) in uploaded.items():
        item = results.get(batch_id, {})
        actual = item.get("reconciliation_status") or (
            "thiếu " + ",".join(item["missing_doc_types"]) if item.get("missing_doc_types") else "chưa có"
        )
        verdict = "OK" if expected is None or expected == actual else "SAI"
        wrong += verdict == "SAI"
        print(f"  {verdict:3} {name:42} {expected or '-':12} → {actual}  ({item.get('batch_number', '?')})")
    checked = sum(1 for _, expected in uploaded.values() if expected)
    print(f"\nĐúng {checked - wrong}/{checked} bộ có đáp án; {len(uploaded)} bộ đã tải.")
    return 1 if wrong else 0


if __name__ == "__main__":
    sys.exit(main())

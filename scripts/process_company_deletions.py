"""Xóa hẳn dữ liệu các công ty đã yêu cầu xóa và hết 30 ngày chờ (Dữ liệu & quyền riêng tư → Yêu cầu xóa).

Chạy mỗi ngày trên máy chủ (cron), ví dụ:
    30 1 * * * cd /opt/docusyncai && docker compose -f docker-compose.yml exec -T backend \
        python scripts/process_company_deletions.py >> /var/log/docusyncai/deletions.log 2>&1

Xóa: chứng từ và file gốc (kể cả bộ đã duyệt cuối), kết quả đối soát, thông báo, lời mời, ngưỡng, mức dùng, nhật ký.
Tài khoản người dùng được ẩn danh. Giữ: dòng công ty (đánh dấu deleted) và đơn thanh toán. --dry-run chỉ liệt kê.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.api.privacy import delete_uploaded_file_from_storage, purge_storage_dirs  # noqa: E402
from src.database import SessionLocal, use_system_context  # noqa: E402
from src.services.privacy import due_for_deletion, purge_organization  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    with SessionLocal() as db:
        use_system_context(db)
        for organization in due_for_deletion(db):
            print(f"{organization.name} ({organization.id}): hẹn xóa {organization.deletion_scheduled_for:%d/%m/%Y}")
            if args.dry_run:
                continue
            counts = purge_organization(
                db, organization, delete_uploaded_file_from_storage, purge_storage_dirs(organization.id)
            )
            print("  đã xóa:", ", ".join(f"{table}={count}" for table, count in counts.items() if count))


if __name__ == "__main__":
    main()

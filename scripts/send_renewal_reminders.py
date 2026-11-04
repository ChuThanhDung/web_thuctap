"""Gửi email nhắc gia hạn cho công ty có gói trả phí hết hạn sau đúng 7 ngày (và 1 ngày) nữa.

Chạy mỗi ngày một lần trên máy chủ (cron), ví dụ 8 giờ sáng giờ Việt Nam:
    0 1 * * * cd /opt/docusyncai && docker compose -f docker-compose.yml exec -T backend \
        python scripts/send_renewal_reminders.py >> /var/log/docusyncai/renewal.log 2>&1

Mỗi công ty nhận nhắc khi gói còn 7 ngày và khi còn 1 ngày (tính theo khoảng 24 giờ, nên chạy đúng một lần mỗi ngày).
--dry-run chỉ liệt kê, không gửi.
"""

import argparse
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from src.config import get_settings  # noqa: E402
from src.database import SessionLocal, use_system_context  # noqa: E402
from src.models.organization import Organization  # noqa: E402
from src.services.billing import chief_emails  # noqa: E402
from src.services.email import send_renewal_reminder_email  # noqa: E402
from src.services.organizations import PLAN_NAMES  # noqa: E402

REMIND_BEFORE_DAYS = (7, 1)


def due_organizations(db, now: datetime) -> list[tuple[Organization, int]]:
    due = []
    for days in REMIND_BEFORE_DAYS:
        start = now + timedelta(days=days - 1)
        end = now + timedelta(days=days)
        rows = db.scalars(
            select(Organization).where(
                Organization.plan != "free",
                Organization.status == "active",
                Organization.plan_expires_at > start,
                Organization.plan_expires_at <= end,
            )
        ).all()
        due.extend((organization, days) for organization in rows)
    return due


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    renew_url = f"{get_settings().app_frontend_url.rstrip('/')}/goi-dich-vu"
    with SessionLocal() as db:
        use_system_context(db)
        for organization, days in due_organizations(db, datetime.now(UTC)):
            emails = chief_emails(db, organization.id)
            print(f"{organization.name}: gói {organization.plan} còn {days} ngày -> {', '.join(emails) or 'không có email'}")
            if args.dry_run:
                continue
            for email in emails:
                send_renewal_reminder_email(
                    email, organization.name, PLAN_NAMES[organization.plan], organization.plan_expires_at, renew_url
                )


if __name__ == "__main__":
    main()

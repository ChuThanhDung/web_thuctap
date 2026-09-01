"""Check SMTP configuration and send an optional test email.

Run from the project root on the same environment that runs the backend:

    python scripts/check_smtp_email.py
    python scripts/check_smtp_email.py --to accountant@example.com
"""

from __future__ import annotations

import argparse
from pathlib import Path
import socket
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import get_settings
from src.services.email import is_smtp_configured, send_batch_rejected_email


def mask(value: str) -> str:
    if not value:
        return "<empty>"
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}{'*' * (len(value) - 4)}{value[-2:]}"


def check_tcp(host: str, port: int, timeout: int = 10) -> tuple[bool, str]:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, "ok"
    except OSError as exc:
        return False, f"{type(exc).__name__}: {exc}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check SMTP settings used by DocusyncAI.")
    parser.add_argument("--to", help="Send a real test email to this address.")
    args = parser.parse_args()

    settings = get_settings()
    configured = is_smtp_configured()
    tcp_ok, tcp_message = check_tcp(settings.smtp_host, settings.smtp_port)

    print("SMTP configuration")
    print(f"- APP_ENV: {settings.app_env}")
    print(f"- SMTP_HOST: {settings.smtp_host}")
    print(f"- SMTP_PORT: {settings.smtp_port}")
    print(f"- SMTP_TLS: {settings.smtp_tls}")
    print(f"- SMTP_USER: {mask(settings.smtp_user)}")
    print(f"- SMTP_FROM: {mask(settings.smtp_from)}")
    print(f"- SMTP_PASSWORD: {'<set>' if settings.smtp_password else '<empty>'}")
    print(f"- APP_FRONTEND_URL: {settings.app_frontend_url or '<empty>'}")
    print(f"- is_smtp_configured: {configured}")
    print(f"- TCP connect: {tcp_message}")

    if not configured:
        print("\nResult: SMTP_USER or SMTP_PASSWORD is missing.")
        return 2

    if not tcp_ok:
        print("\nResult: server cannot connect to the SMTP host/port.")
        return 3

    if args.to:
        sent = send_batch_rejected_email(
            to_email=args.to,
            recipient_name="Kế toán viên",
            batch_number="SMTP_DIAGNOSTIC",
            rejected_by="Kế toán trưởng",
            rejection_note="Email kiểm tra cấu hình SMTP trên server.",
            rejected_at="diagnostic",
            action_url=settings.app_frontend_url or None,
        )
        print(f"- Test email sent: {sent}")
        return 0 if sent else 4

    print("\nResult: configuration is present and SMTP port is reachable.")
    print("Run again with --to <email> to test SMTP login and delivery.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Tạo (hoặc đặt lại mật khẩu) tài khoản quản trị nền tảng: người vận hành DocuSyncAI, không thuộc công ty nào.

Admin nền tảng xem danh sách công ty, gói, mức dùng; khóa/mở công ty và đổi gói ở trang /admin. Không xem được chứng
từ của khách.

Dùng (chạy nơi có DATABASE_URL trỏ tới DB cần tạo, ví dụ trong container backend):
    python scripts/create_platform_admin.py --email ban@vi.du --name "Tên của bạn"
    docker compose exec backend python scripts/create_platform_admin.py --email ban@vi.du --name "Tên của bạn"

Mật khẩu hỏi khi chạy (hoặc lấy từ PLATFORM_ADMIN_PASSWORD), không in ra màn hình và không lưu lại.
Chạy lại với email đã có thì đặt lại mật khẩu. Mất điện thoại 2FA: thêm --reset-mfa (lần đăng nhập sau cài lại).
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402

from src.database import SessionLocal, use_system_context  # noqa: E402
from src.models.role import Role  # noqa: E402
from src.models.schemas import validate_password_strength  # noqa: E402
from src.models.user import User  # noqa: E402
from src.services.auth import hash_password, next_public_user_id  # noqa: E402

ROLE_CODE = "platform_admin"


def read_password() -> str:
    password = os.environ.get("PLATFORM_ADMIN_PASSWORD")
    if not password:
        password = getpass.getpass("Mật khẩu (tối thiểu 10 ký tự, có chữ và số): ")
        if password != getpass.getpass("Nhập lại mật khẩu: "):
            sys.exit("Hai lần nhập mật khẩu không khớp.")
    try:
        return validate_password_strength(password)
    except ValueError as exc:
        sys.exit(str(exc))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True, help="Họ tên hiển thị")
    parser.add_argument("--reset-mfa", action="store_true", help="Tắt xác thực hai lớp để cài lại")
    args = parser.parse_args()
    email = args.email.lower().strip()
    password = read_password()

    with SessionLocal() as db:
        use_system_context(db)
        role = db.scalars(select(Role).where(Role.code == ROLE_CODE)).first()
        if role is None:
            sys.exit("Chưa có vai trò platform_admin: hãy chạy migration (alembic upgrade head) trước.")

        user = db.scalars(select(User).where(func.lower(User.email) == email)).first()
        if user is not None and user.organization_id is not None:
            sys.exit("Email này đang là tài khoản của một công ty. Dùng email khác cho admin nền tảng.")

        if user is None:
            user = User(
                organization_id=None,
                public_id=next_public_user_id(db),
                email=email,
                full_name=args.name.strip(),
                role_id=role.id,
                password_hash=hash_password(password),
                department="Vận hành DocuSyncAI",
                status="ACTIVE",
            )
            db.add(user)
            action = "Đã tạo"
        else:
            user.full_name = args.name.strip()
            user.role_id = role.id
            user.password_hash = hash_password(password)
            user.status = "ACTIVE"
            action = "Đã cập nhật"
            if args.reset_mfa:
                user.totp_secret = None
                user.totp_enabled_at = None
                user.totp_last_step = None
                user.totp_recovery_codes = None
                action += " (đã tắt 2FA, lần đăng nhập sau cài lại)"
        db.commit()
        print(f"{action} tài khoản quản trị nền tảng {email}.")


if __name__ == "__main__":
    main()

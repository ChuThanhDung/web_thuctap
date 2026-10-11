"""Đặt lại mật khẩu cho một người dùng và thu hồi các phiên đăng nhập hiện có.

Dùng: python scripts/reset_password.py <email>
Mật khẩu mới lấy từ biến môi trường NEW_PASSWORD hoặc nhập tương tác (tối thiểu 10 ký tự).
"""

import getpass
import os
import sys
from datetime import UTC, datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import func, update

from src.database import SessionLocal
from src.models.user import User
from src.models.user_session import UserSession
from src.services.auth import hash_password

MIN_LENGTH = 10


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    email = sys.argv[1].lower().strip()
    password = os.environ.get("NEW_PASSWORD") or getpass.getpass("Mật khẩu mới: ")
    if len(password) < MIN_LENGTH:
        print(f"Mật khẩu phải có ít nhất {MIN_LENGTH} ký tự.")
        return 1

    with SessionLocal() as db:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if user is None:
            print(f"Không tìm thấy người dùng: {email}")
            return 1
        user.password_hash = hash_password(password)
        db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        db.commit()
    print(f"Đã đặt lại mật khẩu cho {email}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

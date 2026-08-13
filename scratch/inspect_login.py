import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.database import SessionLocal
from src.models.user import User
from src.services.auth import authenticate_user, verify_password


def inspect_login():
    db = SessionLocal()
    try:
        print("=== 1. TẤT CẢ TÀI KHOẢN TRONG DB ===")
        users = db.scalars(select(User).options(selectinload(User.role))).all()
        print(f"Tổng số tài khoản: {len(users)}")
        for u in users:
            print(
                f" - Email: '{u.email}' | Name: '{u.full_name}' | Role: '{u.role.code}' ({u.role.name}) | Status: '{u.status}' | Hash len: {len(u.password_hash)}"
            )

        print("\n=== 2. THỬ AUTHENTICATE 'chuthanhdung@gmail.com' VỚI MẬT KHẨU '123456' ===")
        user = authenticate_user(db, "chuthanhdung@gmail.com", "123456")
        if user:
            print(f"✅ Authenticate THÀNH CÔNG cho chuthanhdung@gmail.com (Role: {user.role.code})")
        else:
            print("❌ Authenticate THẤT BẠI cho chuthanhdung@gmail.com với mật khẩu '123456'")
            u_check = db.scalars(select(User).where(User.email == "chuthanhdung@gmail.com")).first()
            if u_check:
                match = verify_password("123456", u_check.password_hash)
                print(f"   Check password '123456': {match}, status: {u_check.status}")
            else:
                print("   Không tìm thấy record với email chuthanhdung@gmail.com!")

        print("\n=== 3. THỬ AUTHENTICATE 'chuthanhdungtruong@gmail.com' VỚI MẬT KHẨU '123456' ===")
        user_truong = authenticate_user(db, "chuthanhdungtruong@gmail.com", "123456")
        if user_truong:
            print(f"✅ Authenticate THÀNH CÔNG cho chuthanhdungtruong@gmail.com (Role: {user_truong.role.code})")
        else:
            print("❌ Authenticate THẤT BẠI cho chuthanhdungtruong@gmail.com")

    except Exception as e:
        print(f"Lỗi: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    inspect_login()

import os
import sys

# Thêm thư mục gốc dự án vào PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.database import SessionLocal
from src.models.user import Role, User
from src.services.auth import hash_password


def create_accounts():
    db = SessionLocal()
    try:
        chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()
        acc_role = db.query(Role).filter(Role.code == "accountant").first()

        if not chief_role or not acc_role:
            print("Lỗi: Không tìm thấy vai trò chief_accountant hoặc accountant trong DB.")
            return

        pass_hash = hash_password("123456")

        # 1. Kế toán trưởng: chuthanhdungtruong@gmail.com
        user1 = db.query(User).filter(User.email == "chuthanhdungtruong@gmail.com").first()
        if not user1:
            user1 = User(
                email="chuthanhdungtruong@gmail.com",
                password_hash=pass_hash,
                full_name="Chu Thanh Dũng (Kế toán trưởng)",
                role_id=chief_role.id,
                department="Phòng Kế toán - Tài chính",
                employee_code="CHIEF-002",
                status="ACTIVE",
            )
            db.add(user1)
            print("Đã tạo mới tài khoản Kế toán trưởng: chuthanhdungtruong@gmail.com")
        else:
            user1.password_hash = pass_hash
            user1.role_id = chief_role.id
            user1.status = "ACTIVE"
            print("Đã cập nhật tài khoản Kế toán trưởng: chuthanhdungtruong@gmail.com")

        # 2. Kế toán thường: chuthanhdung@gmail.com
        user2 = db.query(User).filter(User.email == "chuthanhdung@gmail.com").first()
        if not user2:
            user2 = User(
                email="chuthanhdung@gmail.com",
                password_hash=pass_hash,
                full_name="Chu Thanh Dũng (Kế toán viên)",
                role_id=acc_role.id,
                department="Phòng Kế toán - Tài chính",
                employee_code="ACC-002",
                status="ACTIVE",
            )
            db.add(user2)
            print("Đã tạo mới tài khoản Kế toán viên: chuthanhdung@gmail.com")
        else:
            user2.password_hash = pass_hash
            user2.role_id = acc_role.id
            user2.status = "ACTIVE"
            print("Đã cập nhật tài khoản Kế toán viên: chuthanhdung@gmail.com")

        db.commit()
        print("Tạo tài khoản thành công!")
    except Exception as e:
        db.rollback()
        print(f"Lỗi khi tạo tài khoản: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    create_accounts()

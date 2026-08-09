import traceback
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.database import SessionLocal, engine
from src.models.role import Role
from src.models.user import User
from src.services.auth import authenticate_user, create_user_session, write_audit_log

output = []

def log(msg):
    output.append(str(msg))
    print(msg)

log("=== STARTING DIAGNOSTIC FOR LOGIN ===")
db = SessionLocal()
try:
    log("\n1. Checking Users Table:")
    users = db.scalars(select(User).options(selectinload(User.role))).all()
    log(f"Found {len(users)} users in database.")
    for u in users:
        role_code = u.role.code if u.role else "NO_ROLE"
        log(f"  - User: email='{u.email}', status='{u.status}', role='{role_code}'")

    log("\n2. Attempting authenticate_user('chuthanhdung@gmail.com', '123456'):")
    user = authenticate_user(db, "chuthanhdung@gmail.com", "123456")
    log(f"Authenticate result: {user}")

    if user:
        log("\n3. Testing create_user_session:")
        token = create_user_session(db, user, "127.0.0.1", "test-agent")
        log(f"Session created token len: {len(token)}")

        log("\n4. Testing write_audit_log:")
        write_audit_log(db, "LOGIN_SUCCESS", user, {"role": user.role.code}, "127.0.0.1", "test-agent")
        log("Audit log written successfully.")
    else:
        log("\n3. User authentication failed! Testing password check directly:")
        u_check = db.scalars(select(User).where(User.email == "chuthanhdung@gmail.com")).first()
        if u_check:
            from src.services.auth import verify_password
            is_valid = verify_password("123456", u_check.password_hash)
            log(f"  - User found. Status: {u_check.status}, verify_password('123456'): {is_valid}")
            log(f"  - Password Hash: {u_check.password_hash}")
        else:
            log("  - User chuthanhdung@gmail.com does NOT exist in database!")

except Exception as e:
    log(f"\n❌ EXCEPTION CAUGHT: {e}")
    log(traceback.format_exc())
finally:
    db.close()

with open("scratch/diagnostic_result.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(output))

log("Wrote results to scratch/diagnostic_result.txt")

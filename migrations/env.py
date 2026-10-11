from alembic import context
from sqlalchemy import text

import src.models  # noqa: F401  (đăng ký toàn bộ model vào Base.metadata)
from src.database import Base, engine

target_metadata = Base.metadata

# Khóa advisory để nhiều tiến trình khởi động cùng lúc không chạy migration song song.
MIGRATION_LOCK_ID = 727_274_001


def run_migrations_online() -> None:
    with engine.connect() as connection:
        is_postgres = connection.dialect.name == "postgresql"
        if is_postgres:
            connection.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID})
            connection.commit()
        try:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
        finally:
            if is_postgres:
                connection.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID})
                connection.commit()


if context.is_offline_mode():
    raise RuntimeError("Chưa hỗ trợ chế độ offline; hãy chạy `alembic upgrade head` với DATABASE_URL hợp lệ.")

run_migrations_online()

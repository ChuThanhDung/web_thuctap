from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import src.models  # noqa: F401
from src.api.audit_logs import router as audit_logs_router
from src.api.auth import router as auth_router
from src.api.reconciliations import router as reconciliations_router
from src.api.routes import router
from src.api.thresholds import router as thresholds_router
from src.api.uploads import router as uploads_router
from src.config import get_settings
from src.database import Base, engine


def ensure_database_timezone() -> None:
    settings = get_settings()
    if not settings.database_url.startswith("postgresql"):
        return

    with engine.begin() as connection:
        connection.execute(text(f"SET TIME ZONE '{settings.database_timezone}'"))

    database_name = engine.url.database
    if not database_name:
        return

    safe_database_name = '"' + database_name.replace('"', '""') + '"'
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.execute(text(f"ALTER DATABASE {safe_database_name} SET timezone TO '{settings.database_timezone}'"))
    except Exception as exc:
        print(f"Could not persist database timezone setting: {exc}")


def ensure_user_profile_columns() -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id INTEGER",
        "CREATE SEQUENCE IF NOT EXISTS users_public_id_seq",
        """
        WITH numbered_users AS (
            SELECT
                id,
                (SELECT COALESCE(MAX(public_id), 0) FROM users)
                    + row_number() OVER (ORDER BY created_at, email) AS next_public_id
            FROM users
            WHERE public_id IS NULL
        )
        UPDATE users
        SET public_id = numbered_users.next_public_id
        FROM numbered_users
        WHERE users.id = numbered_users.id
        """,
        """
        SELECT setval(
            'users_public_id_seq',
            GREATEST((SELECT COALESCE(MAX(public_id), 0) FROM users), 1),
            (SELECT COALESCE(MAX(public_id), 0) FROM users) > 0
        )
        """,
        "ALTER TABLE users ALTER COLUMN public_id SET DEFAULT nextval('users_public_id_seq')",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS citizen_id VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_citizen_id_unique ON users (citizen_id) WHERE citizen_id IS NOT NULL",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_uploaded_file_storage_columns() -> None:
    statements = [
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'id'
                AND data_type = 'uuid'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'uploaded_files'
                    AND column_name = 'legacy_uuid'
                ) THEN
                    ALTER TABLE uploaded_files RENAME COLUMN id TO legacy_uuid;
                END IF;
            END IF;
        END $$;
        """,
        "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS id INTEGER",
        "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS storage_key VARCHAR(500)",
        "CREATE SEQUENCE IF NOT EXISTS uploaded_files_id_seq",
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'legacy_uuid'
            ) THEN
                WITH numbered_uploads AS (
                    SELECT
                        legacy_uuid,
                        (SELECT COALESCE(MAX(id), 0) FROM uploaded_files)
                            + row_number() OVER (ORDER BY created_at, storage_key) AS next_upload_id
                    FROM uploaded_files
                    WHERE id IS NULL
                )
                UPDATE uploaded_files
                SET id = numbered_uploads.next_upload_id
                FROM numbered_uploads
                WHERE uploaded_files.legacy_uuid = numbered_uploads.legacy_uuid;
            ELSE
                UPDATE uploaded_files
                SET id = nextval('uploaded_files_id_seq')
                WHERE id IS NULL;
            END IF;
        END $$;
        """,
        """
        SELECT setval(
            'uploaded_files_id_seq',
            GREATEST((SELECT COALESCE(MAX(id), 0) FROM uploaded_files), 1),
            (SELECT COALESCE(MAX(id), 0) FROM uploaded_files) > 0
        )
        """,
        "ALTER TABLE uploaded_files ALTER COLUMN id SET DEFAULT nextval('uploaded_files_id_seq')",
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uploaded_files_pkey'
            ) THEN
                ALTER TABLE uploaded_files DROP CONSTRAINT uploaded_files_pkey;
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uploaded_files_pkey'
            ) THEN
                ALTER TABLE uploaded_files ADD CONSTRAINT uploaded_files_pkey PRIMARY KEY (id);
            END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'legacy_uuid'
            ) THEN
                ALTER TABLE uploaded_files DROP COLUMN legacy_uuid;
            END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uploaded_files_uploaded_by_id_fkey'
            ) THEN
                ALTER TABLE uploaded_files DROP CONSTRAINT uploaded_files_uploaded_by_id_fkey;
            END IF;

            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'uploaded_by_id'
                AND data_type = 'uuid'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'uploaded_files'
                    AND column_name = 'uploaded_by_uuid'
                ) THEN
                    ALTER TABLE uploaded_files RENAME COLUMN uploaded_by_id TO uploaded_by_uuid;
                END IF;
            END IF;
        END $$;
        """,
        "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS uploaded_by_id INTEGER",
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'uploaded_by_uuid'
            ) THEN
                UPDATE uploaded_files
                SET uploaded_by_id = users.public_id
                FROM users
                WHERE uploaded_files.uploaded_by_id IS NULL
                AND uploaded_files.uploaded_by_uuid = users.id;
            END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'uploaded_by_uuid'
            ) THEN
                ALTER TABLE uploaded_files DROP COLUMN uploaded_by_uuid;
            END IF;
        END $$;
        """,
        """
        ALTER TABLE uploaded_files
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(0) WITHOUT TIME ZONE
        DEFAULT date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'uploaded_files'
                AND column_name = 'created_at'
                AND data_type = 'timestamp with time zone'
            ) THEN
                ALTER TABLE uploaded_files
                ALTER COLUMN created_at DROP DEFAULT,
                ALTER COLUMN created_at TYPE TIMESTAMP(0) WITHOUT TIME ZONE
                    USING date_trunc('second', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                ALTER COLUMN created_at SET DEFAULT date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()));
            ELSE
                ALTER TABLE uploaded_files
                ALTER COLUMN created_at TYPE TIMESTAMP(0) WITHOUT TIME ZONE
                    USING date_trunc('second', created_at),
                ALTER COLUMN created_at SET DEFAULT date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()));
            END IF;
        END $$;
        """,
        """
        DO $$
        DECLARE
            col_name text;
        BEGIN
            FOREACH col_name IN ARRAY ARRAY[
                'filename',
                'original_filename',
                'stored_filename',
                'storage_provider',
                'file_url',
                'content_type',
                'file_ext',
                'size',
                'status',
                'progress',
                'error_message',
                'case_id',
                'updated_at'
            ]
            LOOP
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'uploaded_files'
                    AND column_name = col_name
                ) THEN
                    EXECUTE format('ALTER TABLE uploaded_files DROP COLUMN %I', col_name);
                END IF;
            END LOOP;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uploaded_files_uploaded_by_id_fkey'
            ) THEN
                ALTER TABLE uploaded_files
                ADD CONSTRAINT uploaded_files_uploaded_by_id_fkey
                FOREIGN KEY (uploaded_by_id) REFERENCES users(public_id) ON DELETE SET NULL;
            END IF;
        END $$;
        """,
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_document_batch_tables() -> None:
    statements = [
        "CREATE SEQUENCE IF NOT EXISTS document_batches_id_seq",
        """
        CREATE TABLE IF NOT EXISTS document_batches (
            id INTEGER PRIMARY KEY DEFAULT nextval('document_batches_id_seq'),
            batch_number VARCHAR(30) UNIQUE NOT NULL,
            created_by_id INTEGER NULL REFERENCES users(public_id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'incomplete',
            created_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT date_trunc('second', timezone('Asia/Ho_Chi_Minh', now())),
            updated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT date_trunc('second', timezone('Asia/Ho_Chi_Minh', now()))
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_document_batches_batch_number ON document_batches (batch_number)",
        "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS batch_id INTEGER",
        "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20)",
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uploaded_files_batch_id_fkey'
            ) THEN
                ALTER TABLE uploaded_files
                ADD CONSTRAINT uploaded_files_batch_id_fkey
                FOREIGN KEY (batch_id) REFERENCES document_batches(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """,
        "CREATE INDEX IF NOT EXISTS ix_uploaded_files_batch_id ON uploaded_files (batch_id)",
        "CREATE INDEX IF NOT EXISTS ix_uploaded_files_doc_type ON uploaded_files (doc_type)",
        """
        UPDATE uploaded_files
        SET doc_type = CASE
            WHEN storage_key LIKE '%/po/%' OR storage_key LIKE 'uploads/po/%' THEN 'po'
            WHEN storage_key LIKE '%/grn/%' OR storage_key LIKE 'uploads/grn/%' THEN 'grn'
            ELSE 'invoice'
        END
        WHERE doc_type IS NULL
        """,
        """
        INSERT INTO document_batches (batch_number, created_by_id, status, created_at, updated_at)
        SELECT
            'BATCH_' || to_char(date_trunc('second', uploaded_files.created_at), 'DD_MM_YYYY') || '_' ||
                lpad(row_number() OVER (
                    PARTITION BY date_trunc('day', uploaded_files.created_at)
                    ORDER BY uploaded_files.created_at, uploaded_files.id
                )::text, 2, '0'),
            uploaded_files.uploaded_by_id,
            'incomplete',
            uploaded_files.created_at,
            uploaded_files.created_at
        FROM uploaded_files
        WHERE uploaded_files.batch_id IS NULL
        """,
        """
        UPDATE uploaded_files
        SET batch_id = document_batches.id
        FROM document_batches
        WHERE uploaded_files.batch_id IS NULL
        AND document_batches.batch_number =
            'BATCH_' || to_char(date_trunc('second', uploaded_files.created_at), 'DD_MM_YYYY') || '_' ||
                lpad((
                    SELECT seq_no
                    FROM (
                        SELECT
                            id,
                            row_number() OVER (
                                PARTITION BY date_trunc('day', created_at)
                                ORDER BY created_at, id
                            ) AS seq_no
                        FROM uploaded_files
                        WHERE batch_id IS NULL
                    ) AS numbered_uploads
                    WHERE numbered_uploads.id = uploaded_files.id
                )::text, 2, '0')
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM document_batches) THEN
                UPDATE document_batches
                SET batch_number = 'MIGRATING_BATCH_' || id::text;

                WITH numbered_batches AS (
                    SELECT
                        id,
                        'BATCH_' || to_char(date_trunc('second', created_at), 'DD_MM_YYYY') || '_' ||
                            lpad(row_number() OVER (
                                PARTITION BY date_trunc('day', created_at)
                                ORDER BY created_at, id
                            )::text, 2, '0') AS next_batch_number
                    FROM document_batches
                )
                UPDATE document_batches
                SET batch_number = numbered_batches.next_batch_number
                FROM numbered_batches
                WHERE document_batches.id = numbered_batches.id;
            END IF;
        END $$;
        """,
        """
        UPDATE document_batches
        SET status = CASE
            WHEN EXISTS (
                SELECT 1 FROM uploaded_files WHERE uploaded_files.batch_id = document_batches.id AND doc_type = 'po'
            )
            AND EXISTS (
                SELECT 1 FROM uploaded_files WHERE uploaded_files.batch_id = document_batches.id AND doc_type = 'invoice'
            )
            AND EXISTS (
                SELECT 1 FROM uploaded_files WHERE uploaded_files.batch_id = document_batches.id AND doc_type = 'grn'
            )
            THEN 'ready'
            ELSE 'incomplete'
        END
        """,
        """
        SELECT setval(
            'document_batches_id_seq',
            GREATEST((SELECT COALESCE(MAX(id), 0) FROM document_batches), 1),
            (SELECT COALESCE(MAX(id), 0) FROM document_batches) > 0
        )
        """,
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def seed_initial_data_if_needed() -> None:
    from sqlalchemy.orm import Session

    from src.models.role import Role
    from src.models.user import User
    from src.services.auth import hash_password

    with Session(engine) as db:
        try:
            acc_role = db.query(Role).filter(Role.code == "accountant").first()
            if not acc_role:
                acc_role = Role(
                    code="accountant",
                    name="Kế toán viên",
                    description="Thực hiện đối soát hóa đơn, tải chứng từ và theo dõi nhật ký nghiệp vụ.",
                )
                db.add(acc_role)

            chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()
            if not chief_role:
                chief_role = Role(
                    code="chief_accountant",
                    name="Kế toán trưởng",
                    description="Theo dõi tổng quan, phê duyệt đối soát và cấu hình quy trình.",
                )
                db.add(chief_role)

            db.commit()

            acc_role = db.query(Role).filter(Role.code == "accountant").first()
            chief_role = db.query(Role).filter(Role.code == "chief_accountant").first()

            default_password_hash = hash_password("123456")

            default_users = [
                {
                    "email": "chuthanhdungtruong@gmail.com",
                    "full_name": "Chu Thanh Dũng (Kế toán trưởng)",
                    "role_id": chief_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "CHIEF-002",
                },
                {
                    "email": "chuthanhdung@gmail.com",
                    "full_name": "Chu Thanh Dũng (Kế toán viên)",
                    "role_id": acc_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "ACC-002",
                },
                {
                    "email": "accountant@docusync.ai",
                    "full_name": "Nguyễn Thị Lan",
                    "role_id": acc_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "ACC-001",
                },
                {
                    "email": "chief.accountant@docusync.ai",
                    "full_name": "Trần Văn Minh",
                    "role_id": chief_role.id,
                    "department": "Phòng Kế toán - Tài chính",
                    "employee_code": "CHIEF-001",
                },
            ]

            for udata in default_users:
                user = db.query(User).filter(User.email == udata["email"]).first()
                if not user:
                    user = User(
                        public_id=(db.scalar(text("SELECT COALESCE(MAX(public_id), 0) + 1 FROM users")) or 1),
                        email=udata["email"],
                        password_hash=default_password_hash,
                        full_name=udata["full_name"],
                        role_id=udata["role_id"],
                        department=udata["department"],
                        employee_code=udata["employee_code"],
                        status="ACTIVE",
                    )
                    db.add(user)
                else:
                    if user.public_id is None:
                        user.public_id = db.scalar(text("SELECT COALESCE(MAX(public_id), 0) + 1 FROM users")) or 1
                    user.password_hash = default_password_hash
                    user.role_id = udata["role_id"]
                    user.full_name = udata["full_name"]
                    user.status = "ACTIVE"

            db.commit()
            print("Seed initial users & roles successfully.")
        except Exception as e:
            db.rollback()
            print(f"Error seeding initial data: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    ensure_database_timezone()
    ensure_user_profile_columns()
    ensure_uploaded_file_storage_columns()
    ensure_document_batch_tables()
    seed_initial_data_if_needed()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    yield
    print("Shutting down...")



app = FastAPI(
    title="AI20K Agent",
    description="AI Agent built with LangGraph",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(reconciliations_router, prefix="/api/v1")
app.include_router(audit_logs_router, prefix="/api/v1")
app.include_router(thresholds_router, prefix="/api/v1")
app.include_router(uploads_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}

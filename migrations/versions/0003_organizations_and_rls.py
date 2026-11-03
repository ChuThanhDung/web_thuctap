"""Nhiều công ty dùng chung hệ thống, cách ly bằng Row-Level Security

- Bảng `organizations`; công ty "DocuSync Demo" nhận toàn bộ dữ liệu có từ trước.
- Mọi bảng nghiệp vụ có `organization_id`, mặc định lấy từ `app.current_org` của giao dịch (src.database).
- Mã bộ, mã đối soát, số PO/GRN, loại ngưỡng, mã nhân viên, CCCD chỉ còn unique trong từng công ty.
  Email vẫn unique toàn hệ thống vì là tên đăng nhập.
- Role `docusync_app` (không phải superuser, không sở hữu bảng): app chạy `SET ROLE docusync_app` nên RLS có hiệu lực.
  Policy: chỉ thấy dòng của công ty hiện tại, trừ khi phiên bật `app.rls_bypass` (đăng nhập, OTP, seed, việc nền).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMO_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001"
APP_ROLE = "docusync_app"
CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"

# (bảng, organization_id được phép NULL). users: admin nền tảng không thuộc công ty; audit_logs: sự kiện trước khi
# đăng nhập (đăng nhập sai, OTP) chưa gắn công ty.
TENANT_TABLES = [
    ("users", True),
    ("audit_logs", True),
    ("notifications", False),
    ("thresholds", False),
    ("document_batches", False),
    ("document_batch_histories", False),
    ("uploaded_files", False),
    ("uploaded_document_extractions", False),
    ("reconciliation_cases", False),
    ("line_items", False),
    ("purchase_orders", False),
    ("purchase_order_items", False),
    ("goods_receipt_notes", False),
    ("goods_receipt_note_items", False),
]

# (bảng, cột, các ràng buộc/index unique cũ cần bỏ)
PER_ORG_UNIQUES = [
    ("document_batches", "batch_number", ["INDEX ix_document_batches_batch_number"]),
    ("reconciliation_cases", "case_number", ["INDEX ix_reconciliation_cases_case_number"]),
    ("purchase_orders", "po_number", ["INDEX ix_purchase_orders_po_number"]),
    ("goods_receipt_notes", "grn_number", ["INDEX ix_goods_receipt_notes_grn_number"]),
    ("thresholds", "category", ["CONSTRAINT thresholds_category_key"]),
    ("users", "employee_code", ["CONSTRAINT users_employee_code_key"]),
    ("users", "citizen_id", ["CONSTRAINT users_citizen_id_key", "INDEX ix_users_citizen_id_unique"]),
]


def _drop(table: str, item: str) -> None:
    kind, name = item.split(" ", 1)
    if kind == "INDEX":
        op.execute(f"DROP INDEX IF EXISTS {name}")
    else:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS organizations (
            id uuid PRIMARY KEY,
            name varchar(255) NOT NULL,
            tax_id varchar(20),
            plan varchar(20) NOT NULL DEFAULT 'free',
            status varchar(20) NOT NULL DEFAULT 'active',
            trial_ends_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"INSERT INTO organizations (id, name, plan) VALUES ('{DEMO_ORGANIZATION_ID}', 'DocuSync Demo', 'pro') "
        "ON CONFLICT (id) DO NOTHING"
    )

    for table, nullable in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS organization_id uuid")
        op.execute(f"UPDATE {table} SET organization_id = '{DEMO_ORGANIZATION_ID}' WHERE organization_id IS NULL")
        if not nullable:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN organization_id SET NOT NULL")
        op.execute(f"ALTER TABLE {table} ALTER COLUMN organization_id SET DEFAULT {CURRENT_ORG}")
        # DB tạo mới đã có khóa ngoại từ model (migration 0001 dùng create_all): chỉ thêm khi chưa có.
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint c
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                    WHERE c.conrelid = '{table}'::regclass AND c.contype = 'f' AND a.attname = 'organization_id'
                ) THEN
                    ALTER TABLE {table} ADD CONSTRAINT fk_{table}_organization
                        FOREIGN KEY (organization_id) REFERENCES organizations (id);
                END IF;
            END
            $$;
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_organization_id ON {table} (organization_id)")

    for table, column, old_items in PER_ORG_UNIQUES:
        for item in old_items:
            _drop(table, item)
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_{column} ON {table} ({column})")
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_{table}_org_{column}') THEN
                    ALTER TABLE {table} ADD CONSTRAINT uq_{table}_org_{column} UNIQUE (organization_id, {column});
                END IF;
            END
            $$;
            """
        )

    # Mã người dùng sinh bằng sequence (MAX + 1 bị RLS giới hạn trong một công ty). Đồng bộ sequence với mã lớn nhất
    # hiện có, vì trước đây tài khoản tạo bằng MAX + 1 không làm sequence tăng.
    op.execute("CREATE SEQUENCE IF NOT EXISTS users_public_id_seq")
    op.execute(
        "SELECT setval('users_public_id_seq', GREATEST((SELECT COALESCE(MAX(public_id), 0) FROM users), 1), "
        "(SELECT COALESCE(MAX(public_id), 0) FROM users) > 0)"
    )

    # Role cho app: không sở hữu bảng, không phải superuser, nên chịu RLS.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} NOLOGIN;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT {APP_ROLE} TO CURRENT_USER")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}")
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE}"
    )
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO {APP_ROLE}")

    for table, _nullable in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
                USING (current_setting('app.rls_bypass', true) = 'on' OR organization_id = {CURRENT_ORG})
                WITH CHECK (current_setting('app.rls_bypass', true) = 'on' OR organization_id = {CURRENT_ORG})
            """
        )


def downgrade() -> None:
    for table, _nullable in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    for table, column, _old_items in PER_ORG_UNIQUES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS uq_{table}_org_{column}")
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_{column}")
        if table == "users" and column == "citizen_id":
            op.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_citizen_id_unique ON users (citizen_id) "
                "WHERE citizen_id IS NOT NULL"
            )
        elif table in ("thresholds", "users"):
            op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {table}_{column}_key UNIQUE ({column})")
        else:
            op.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_{column} ON {table} ({column})")

    for table, _nullable in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS organization_id")

    op.execute("DROP TABLE IF EXISTS organizations")

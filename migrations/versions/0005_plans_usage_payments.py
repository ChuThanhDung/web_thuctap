"""Gói dịch vụ, hạn mức theo tháng, thanh toán qua SePay

- organizations.plan_expires_at: hạn của gói đã trả tiền (NULL = không hết hạn).
- uploaded_files.file_size_bytes: để tính dung lượng lưu trữ theo gói.
- usage_counters: số bộ tạo và số file đọc bằng AI của mỗi công ty theo tháng.
- payments: mỗi lần nâng cấp/gia hạn, đối chiếu với giao dịch SePay gửi về.

Hai bảng mới cách ly theo công ty bằng RLS như các bảng nghiệp vụ khác.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "docusync_app"
CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz")
    op.execute("ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_size_bytes bigint")

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS usage_counters (
            organization_id uuid NOT NULL DEFAULT {CURRENT_ORG} REFERENCES organizations (id),
            period varchar(7) NOT NULL,
            batches_created integer NOT NULL DEFAULT 0,
            ai_files integer NOT NULL DEFAULT 0,
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (organization_id, period)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS payments (
            id uuid PRIMARY KEY,
            organization_id uuid NOT NULL DEFAULT {CURRENT_ORG} REFERENCES organizations (id),
            code varchar(20) NOT NULL UNIQUE,
            plan varchar(20) NOT NULL,
            months integer NOT NULL,
            amount bigint NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            created_by_id uuid,
            expires_at timestamptz NOT NULL,
            paid_at timestamptz,
            paid_amount bigint,
            provider_transaction_id varchar(64) UNIQUE,
            provider_reference varchar(100),
            period_start timestamptz,
            period_end timestamptz,
            created_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_organization_id ON payments (organization_id)")

    # Mức dùng tháng hiện tại của dữ liệu có sẵn (ngày tạo lưu theo giờ Việt Nam, không múi giờ). File không phải XML
    # được tính là một lượt AI, giống cách đếm khi tải lên.
    op.execute(
        """
        INSERT INTO usage_counters (organization_id, period, batches_created, ai_files)
        SELECT o.id,
               to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY-MM'),
               (SELECT count(*) FROM document_batches b WHERE b.organization_id = o.id
                    AND b.created_at >= date_trunc('month', timezone('Asia/Ho_Chi_Minh', now()))),
               (SELECT count(*) FROM uploaded_files f WHERE f.organization_id = o.id
                    AND f.created_at >= date_trunc('month', timezone('Asia/Ho_Chi_Minh', now()))
                    AND lower(f.storage_key) NOT LIKE '%.xml')
        FROM organizations o
        ON CONFLICT (organization_id, period) DO NOTHING
        """
    )

    for table in ("usage_counters", "payments"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
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
    op.execute("DROP TABLE IF EXISTS payments")
    op.execute("DROP TABLE IF EXISTS usage_counters")
    op.execute("ALTER TABLE uploaded_files DROP COLUMN IF EXISTS file_size_bytes")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS plan_expires_at")

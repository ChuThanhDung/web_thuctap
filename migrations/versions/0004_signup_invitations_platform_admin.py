"""Tự đăng ký công ty, lời mời người dùng, vai trò admin nền tảng

- Vai trò `platform_admin`: người vận hành hệ thống, không thuộc công ty nào (users.organization_id NULL). Chỉ xem
  thông tin công ty và số liệu sử dụng, không xem chứng từ.
- `signup_requests`: đăng ký đang chờ xác thực email (chưa có công ty nên không chịu RLS).
- `user_invitations`: lời mời vào công ty, cách ly theo công ty như các bảng nghiệp vụ khác.

Bảng tạo bằng IF NOT EXISTS vì migration 0001 dùng create_all từ model hiện tại trên DB mới.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "docusync_app"
CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (id, code, name, description, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), 'platform_admin', 'Quản trị nền tảng',
               'Quản lý công ty khách hàng, gói dịch vụ và mức sử dụng. Không xem chứng từ của khách.', true, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'platform_admin')
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS signup_requests (
            id uuid PRIMARY KEY,
            email varchar(255) NOT NULL,
            company_name varchar(255) NOT NULL,
            tax_id varchar(20),
            full_name varchar(100) NOT NULL,
            password_hash varchar(255) NOT NULL,
            otp_hash varchar(128) NOT NULL,
            attempt_count integer NOT NULL DEFAULT 0,
            ip_address varchar(64),
            terms_accepted_at timestamptz NOT NULL,
            expires_at timestamptz NOT NULL,
            otp_sent_at timestamptz NOT NULL,
            verified_at timestamptz,
            organization_id uuid REFERENCES organizations (id),
            created_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_signup_requests_email ON signup_requests (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_signup_requests_ip_address ON signup_requests (ip_address)")

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS user_invitations (
            id uuid PRIMARY KEY,
            organization_id uuid NOT NULL DEFAULT {CURRENT_ORG} REFERENCES organizations (id),
            email varchar(255) NOT NULL,
            full_name varchar(100) NOT NULL,
            role_code varchar(50) NOT NULL,
            token_hash varchar(128) NOT NULL UNIQUE,
            invited_by_id uuid REFERENCES users (id),
            expires_at timestamptz NOT NULL,
            accepted_at timestamptz,
            revoked_at timestamptz,
            created_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_invitations_email ON user_invitations (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_invitations_organization_id ON user_invitations (organization_id)")

    for table in ("signup_requests", "user_invitations"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")

    op.execute("ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_invitations FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON user_invitations")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON user_invitations
            USING (current_setting('app.rls_bypass', true) = 'on' OR organization_id = {CURRENT_ORG})
            WITH CHECK (current_setting('app.rls_bypass', true) = 'on' OR organization_id = {CURRENT_ORG})
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_invitations")
    op.execute("DROP TABLE IF EXISTS signup_requests")
    op.execute(
        "DELETE FROM roles r WHERE r.code = 'platform_admin' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role_id = r.id)"
    )

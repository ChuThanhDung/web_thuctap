"""Bảo mật: xác thực hai lớp, lịch sử mật khẩu, mã hóa CCCD/địa chỉ

- users.citizen_id, users.address chuyển sang text vì lưu dạng mã hóa (src.services.crypto). Dữ liệu cũ được mã hóa
  lúc ứng dụng khởi động (cần khóa trong môi trường, không đặt trong migration).
- users.citizen_id_hash: dấu vân tay của CCCD để kiểm tra trùng trong công ty (thay ràng buộc unique trên CCCD).
- users.totp_*: khóa TOTP (mã hóa), thời điểm bật, bước thời gian đã dùng, hash mã khôi phục.
- password_history, mfa_challenges: không chứa dữ liệu nghiệp vụ, gắn với người dùng như user_sessions.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "docusync_app"


def upgrade() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN citizen_id TYPE text")
    op.execute("ALTER TABLE users ALTER COLUMN address TYPE text")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS citizen_id_hash varchar(64)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes jsonb")

    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_org_citizen_id")
    op.execute("DROP INDEX IF EXISTS ix_users_citizen_id")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_org_citizen_id_hash') THEN
                ALTER TABLE users ADD CONSTRAINT uq_users_org_citizen_id_hash UNIQUE (organization_id, citizen_id_hash);
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS password_history (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            password_hash varchar(255) NOT NULL,
            created_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_password_history_user_id ON password_history (user_id)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS mfa_challenges (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            token_hash varchar(128) NOT NULL UNIQUE,
            attempt_count integer NOT NULL DEFAULT 0,
            expires_at timestamptz NOT NULL,
            used_at timestamptz,
            ip_address varchar(64),
            created_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_mfa_challenges_user_id ON mfa_challenges (user_id)")
    for table in ("password_history", "mfa_challenges"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mfa_challenges")
    op.execute("DROP TABLE IF EXISTS password_history")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_org_citizen_id_hash")
    for column in ("totp_recovery_codes", "totp_last_step", "totp_enabled_at", "totp_secret", "citizen_id_hash"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {column}")

"""Pháp lý và quyền dữ liệu: đồng ý điều khoản có phiên bản, tắt AI theo công ty, yêu cầu xóa công ty

- users.terms_version / terms_accepted_at: phiên bản điều khoản người dùng đã đồng ý và thời điểm.
- signup_requests.terms_version: phiên bản đồng ý lúc đăng ký (chuyển sang tài khoản khi tạo).
- organizations.ai_enabled: false = chỉ nhận XML, không gửi PDF/ảnh ra dịch vụ AI ở nước ngoài.
- organizations.deletion_*: kế toán trưởng yêu cầu xóa công ty, thực hiện sau 30 ngày (hủy được trong thời gian đó).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version varchar(20)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz")
    op.execute("ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS terms_version varchar(20)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_requested_by uuid")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at timestamptz")


def downgrade() -> None:
    for column in (
        "deleted_at",
        "deletion_requested_by",
        "deletion_scheduled_for",
        "deletion_requested_at",
        "ai_enabled",
    ):
        op.execute(f"ALTER TABLE organizations DROP COLUMN IF EXISTS {column}")
    op.execute("ALTER TABLE signup_requests DROP COLUMN IF EXISTS terms_version")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS terms_version")

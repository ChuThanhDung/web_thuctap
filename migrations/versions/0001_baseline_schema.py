"""Baseline schema

Gom toàn bộ schema hiện có (create_all + các bước ensure_* cũ) thành một revision idempotent, nên chạy an toàn
trên cả DB mới lẫn DB đã tồn tại trước khi dùng Alembic. Từ revision này trở đi, mỗi thay đổi schema là một
revision riêng (`alembic revision -m "..."`), không thêm vào module schema_bootstrap.

Revision ID: 0001
Revises:
Create Date: 2026-10-11
"""

from collections.abc import Sequence

from alembic import op

from src.schema_bootstrap import bootstrap_legacy_schema

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bootstrap_legacy_schema(op.get_bind())


def downgrade() -> None:
    raise NotImplementedError("Baseline không hỗ trợ downgrade; khôi phục từ bản sao lưu nếu cần.")

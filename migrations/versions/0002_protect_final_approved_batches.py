"""Bảo vệ bộ chứng từ đã duyệt cuối khỏi bị xóa

Bộ chứng từ (PO + GRN + Invoice) đã qua hai lần duyệt là hồ sơ lưu trữ. Ứng dụng đã chặn xóa/sửa ở tầng API; trigger
này là lớp bảo vệ thứ hai ở tầng database, để lỗi mã, script hay lệnh SQL thủ công cũng không xóa nhầm được.

Muốn xóa hợp lệ (ví dụ theo chính sách lưu trữ), hạ trạng thái batch khỏi `final_approved` bằng một thao tác có ghi nhận.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-11
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION protect_final_approved_batches() RETURNS trigger AS $$
BEGIN
    IF TG_TABLE_NAME = 'document_batches' THEN
        IF OLD.status = 'final_approved' THEN
            RAISE EXCEPTION 'Không thể xóa bộ chứng từ đã duyệt cuối (batch id %)', OLD.id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSIF OLD.batch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM document_batches b WHERE b.id = OLD.batch_id AND b.status = 'final_approved'
    ) THEN
        RAISE EXCEPTION 'Không thể xóa chứng từ thuộc bộ đã duyệt cuối (batch id %)', OLD.batch_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
"""

PROTECTED_TABLES = ("document_batches", "uploaded_files", "uploaded_document_extractions")


def upgrade() -> None:
    op.execute(FUNCTION_SQL)
    for table in PROTECTED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS protect_final_approved_{table} ON {table}")
        op.execute(
            f"CREATE TRIGGER protect_final_approved_{table} BEFORE DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION protect_final_approved_batches()"
        )


def downgrade() -> None:
    for table in PROTECTED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS protect_final_approved_{table} ON {table}")
    op.execute("DROP FUNCTION IF EXISTS protect_final_approved_batches()")

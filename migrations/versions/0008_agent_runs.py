"""Trợ lý AI (agent): nhật ký mỗi lần chạy, hạn mức lượt dùng, bộ tạm để tự xếp chứng từ

- agent_runs: mỗi lần agent chạy (xếp bộ, điều tra, soạn thư, hỏi đáp): ai chạy, đầu vào tóm tắt, kết quả, số token.
- usage_counters.agent_calls: số lượt gọi AI của agent trong tháng (hạn mức theo gói).
- document_batches.is_inbox: bộ tạm chứa file thả lẫn lộn chờ agent xếp. Không hiện trong danh sách, không đối soát,
  không tính hạn mức bộ.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "docusync_app"
CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    op.execute("ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS agent_calls integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE document_batches ADD COLUMN IF NOT EXISTS is_inbox boolean NOT NULL DEFAULT false")
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS agent_runs (
            id serial PRIMARY KEY,
            organization_id uuid NOT NULL DEFAULT {CURRENT_ORG} REFERENCES organizations (id),
            user_id uuid,
            kind varchar(30) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'ok',
            input_summary jsonb,
            output jsonb,
            llm_calls integer NOT NULL DEFAULT 0,
            prompt_tokens integer NOT NULL DEFAULT 0,
            completion_tokens integer NOT NULL DEFAULT 0,
            model varchar(60),
            created_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_agent_runs_organization_id ON agent_runs (organization_id, created_at)")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON SEQUENCE agent_runs_id_seq TO {APP_ROLE}")
    op.execute("ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE agent_runs FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON agent_runs")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON agent_runs
            USING (current_setting('app.rls_bypass', true) = 'on' OR organization_id = {CURRENT_ORG})
            WITH CHECK (current_setting('app.rls_bypass', true) = 'on' OR organization_id = {CURRENT_ORG})
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_runs")
    op.execute("ALTER TABLE document_batches DROP COLUMN IF EXISTS is_inbox")
    op.execute("ALTER TABLE usage_counters DROP COLUMN IF EXISTS agent_calls")

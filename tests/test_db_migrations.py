from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from src.database import engine
from src.db_migrations import build_alembic_config, run_migrations


def current_revision() -> str | None:
    with engine.connect() as connection:
        return connection.execute(text("SELECT version_num FROM alembic_version")).scalar()


def test_database_is_at_head_revision():
    run_migrations()
    head = ScriptDirectory.from_config(build_alembic_config()).get_current_head()
    assert current_revision() == head


def test_migrations_are_idempotent():
    run_migrations()
    run_migrations()
    assert current_revision() == ScriptDirectory.from_config(build_alembic_config()).get_current_head()


def test_expected_tables_exist():
    run_migrations()
    tables = set(inspect(engine).get_table_names())
    expected = {
        "users",
        "roles",
        "user_sessions",
        "password_reset_otps",
        "audit_logs",
        "document_batches",
        "uploaded_files",
        "uploaded_document_extractions",
        "reconciliation_cases",
        "notifications",
        "thresholds",
        "alembic_version",
    }
    assert expected <= tables


def test_there_is_a_single_migration_head():
    heads = ScriptDirectory.from_config(build_alembic_config()).get_heads()
    assert len(heads) == 1

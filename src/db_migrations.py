from pathlib import Path

from alembic import command
from alembic.config import Config

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def build_alembic_config() -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    return config


def run_migrations() -> None:
    """Áp dụng toàn bộ migration còn thiếu (`alembic upgrade head`)."""
    command.upgrade(build_alembic_config(), "head")

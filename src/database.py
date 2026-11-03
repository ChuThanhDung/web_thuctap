import uuid
from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config import get_settings

settings = get_settings()
engine_kwargs = {"pool_pre_ping": True}
if settings.database_url.startswith("postgresql"):
    engine_kwargs["connect_args"] = {"options": f"-c timezone={settings.database_timezone}"}

# admin_engine: tài khoản chủ DB, dùng cho migration và thiết lập DB (không chịu RLS).
# engine: kết nối của app; mỗi kết nối chuyển sang role docusync_app (không phải superuser, không sở hữu bảng)
# để Row-Level Security có hiệu lực. Role do migration 0003 tạo; trước khi có role thì giữ nguyên tài khoản.
APP_DB_ROLE = "docusync_app"
admin_engine = create_engine(settings.database_url, **engine_kwargs)
engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _use_app_role(dbapi_connection, connection_record) -> None:
    if engine.dialect.name != "postgresql":
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (APP_DB_ROLE,))
        if cursor.fetchone():
            cursor.execute(f"SET ROLE {APP_DB_ROLE}")
    finally:
        cursor.close()
    dbapi_connection.commit()


class Base(DeclarativeBase):
    pass


# --- Ngữ cảnh công ty cho Row-Level Security -------------------------------------------------------------------
# Mỗi phiên làm việc mang một trong hai chế độ:
#   - hệ thống (mặc định): bỏ qua RLS. Dùng cho đăng nhập, OTP, migration, seed, công việc nền.
#   - công ty: chỉ thấy và chỉ ghi được dữ liệu của một công ty. get_current_user chuyển sang chế độ này ngay sau
#     khi xác thực, nên mọi endpoint đã đăng nhập đều bị DB giới hạn trong công ty của người dùng.
# Giá trị đặt bằng set_config(..., is_local=true): chỉ sống trong giao dịch hiện tại, không rò sang kết nối khác
# trong pool. Vì vậy nó được áp lại ở đầu mỗi giao dịch (sự kiện after_begin) từ session.info.

_ORG_KEY = "organization_id"
_BYPASS_KEY = "rls_bypass"

# Công ty mặc định cho phiên chưa đặt ngữ cảnh. Chỉ test gán giá trị này (công ty Demo) để fixture ghi thẳng vào DB;
# production để None, nên ghi dữ liệu mà quên ngữ cảnh sẽ lỗi NOT NULL thay vì lặng lẽ rơi vào một công ty.
default_organization_id: uuid.UUID | None = None


def _apply_context(connection, info: dict) -> None:
    if connection.dialect.name != "postgresql":
        return
    org_id = info[_ORG_KEY] if _ORG_KEY in info else default_organization_id
    bypass = info.get(_BYPASS_KEY, True)
    connection.execute(
        text("SELECT set_config('app.current_org', :org, true), set_config('app.rls_bypass', :bypass, true)"),
        {"org": str(org_id) if org_id else "", "bypass": "on" if bypass else "off"},
    )


@event.listens_for(Session, "after_begin")
def _restore_organization_context(session: Session, transaction, connection) -> None:
    _apply_context(connection, session.info)


def set_organization_context(db: Session, organization_id: uuid.UUID | None) -> None:
    """Giới hạn phiên làm việc trong một công ty (bật RLS). organization_id None = không thấy dữ liệu công ty nào."""
    db.info[_ORG_KEY] = organization_id
    db.info[_BYPASS_KEY] = False
    if db.in_transaction():
        _apply_context(db.connection(), db.info)


def use_system_context(db: Session, organization_id: uuid.UUID | None = None) -> None:
    """Chế độ hệ thống: bỏ qua RLS. organization_id (nếu có) là công ty mặc định cho bản ghi tạo mới."""
    db.info[_ORG_KEY] = organization_id
    db.info[_BYPASS_KEY] = True
    if db.in_transaction():
        _apply_context(db.connection(), db.info)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

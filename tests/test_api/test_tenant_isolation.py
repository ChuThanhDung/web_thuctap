"""Cách ly dữ liệu giữa các công ty: mỗi công ty chỉ thấy và chỉ sửa được dữ liệu của mình.

Test dùng đăng nhập thật (không thay get_current_user) để đi đúng đường RLS: get_current_user đặt app.current_org,
và Postgres (role docusync_app) tự lọc theo công ty. Công ty A là công ty Demo với tài khoản seed; công ty B tạo riêng.
"""

import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import text

from src.database import SessionLocal, set_organization_context, use_system_context
from src.models.organization import DEMO_ORGANIZATION_ID, Organization
from src.models.reconciliation import DocumentBatch, Threshold
from src.models.role import Role
from src.models.user import User
from src.services.auth import hash_password, next_public_user_id
from src.services.organizations import ensure_default_thresholds
from tests.conftest import purge_batch_tables

ORG_B_ID = uuid.UUID("00000000-0000-0000-0000-0000000000b2")
PASSWORD = "Isolation-test-2026"
XML_SET = Path(__file__).resolve().parents[2] / "dataset" / "xml" / "batch_01_match"


@pytest.fixture(scope="module", autouse=True)
def organization_b():
    """Công ty B với một kế toán viên và một kế toán trưởng."""
    with SessionLocal() as db:
        use_system_context(db, ORG_B_ID)
        if db.get(Organization, ORG_B_ID) is None:
            db.add(Organization(id=ORG_B_ID, name="Công ty B (test)", plan="pro"))
            db.flush()
            roles = {role.code: role for role in db.query(Role).all()}
            for email, role in (
                ("b.accountant@isolation.test", "accountant"),
                ("b.chief@isolation.test", "chief_accountant"),
            ):
                db.add(
                    User(
                        organization_id=ORG_B_ID,
                        public_id=next_public_user_id(db),
                        email=email,
                        password_hash=hash_password(PASSWORD),
                        full_name=f"B {role}",
                        role_id=roles[role].id,
                        status="ACTIVE",
                    )
                )
            ensure_default_thresholds(db, ORG_B_ID)
            db.commit()
    yield


@pytest.fixture(autouse=True)
def clean_batches(db_session):
    purge_batch_tables(db_session)
    yield
    db_session.rollback()
    purge_batch_tables(db_session)


async def login(client, email, password):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest_asyncio.fixture
async def a_accountant(client):
    return await login(client, "accountant@docusync.ai", "123456")


@pytest_asyncio.fixture
async def a_chief(client):
    return await login(client, "chief.accountant@docusync.ai", "123456")


@pytest_asyncio.fixture
async def b_accountant(client):
    return await login(client, "b.accountant@isolation.test", PASSWORD)


@pytest_asyncio.fixture
async def b_chief(client):
    return await login(client, "b.chief@isolation.test", PASSWORD)


async def upload_xml_set(client, headers):
    """Tạo một bộ và tải đủ 3 file XML (đọc cục bộ, không gọi AI)."""
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    for doc_type, name in (
        ("po", "01_purchase_order.xml"),
        ("grn", "02_goods_receipt.xml"),
        ("invoice", "03_invoice.xml"),
    ):
        response = await client.post(
            "/api/v1/uploads",
            headers=headers,
            data={"doc_type": doc_type, "batch_id": str(batch["id"])},
            files={"file": (name, (XML_SET / name).read_bytes(), "application/xml")},
        )
        assert response.status_code == 200, response.text
    return batch


def test_app_connections_run_as_the_non_superuser_role(db_session):
    # Superuser luôn bỏ qua RLS, nên app phải chạy bằng role thường.
    role, is_superuser = db_session.execute(
        text("SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user")
    ).one()
    assert role == "docusync_app"
    assert is_superuser is False


@pytest.mark.asyncio
async def test_batches_of_another_company_are_invisible_and_untouchable(client, a_accountant, a_chief, b_accountant):
    b_batch = (await client.post("/api/v1/uploads/batches", headers=b_accountant)).json()

    for headers in (a_accountant, a_chief):
        listed = (await client.get("/api/v1/uploads/batches", headers=headers)).json()["items"]
        assert b_batch["id"] not in {item["id"] for item in listed}
        response = await client.patch(f"/api/v1/uploads/batches/{b_batch['id']}", headers=headers, json={"note": "x"})
        assert response.status_code == 404
        assert (await client.delete(f"/api/v1/uploads/batches/{b_batch['id']}", headers=headers)).status_code == 404

    # Công ty B vẫn thấy bộ của mình.
    own = (await client.get("/api/v1/uploads/batches", headers=b_accountant)).json()["items"]
    assert b_batch["id"] in {item["id"] for item in own}


@pytest.mark.asyncio
async def test_uploaded_files_of_another_company_cannot_be_opened(client, a_chief, b_accountant):
    b_batch = await upload_xml_set(client, b_accountant)
    b_detail = (await client.get("/api/v1/uploads/batches", headers=b_accountant)).json()["items"]
    file_ids = [f["id"] for item in b_detail if item["id"] == b_batch["id"] for f in item["files"]]
    assert file_ids
    for file_id in file_ids:
        assert (await client.get(f"/api/v1/uploads/{file_id}/file", headers=a_chief)).status_code == 404


@pytest.mark.asyncio
async def test_same_document_numbers_in_two_companies_get_separate_results(client, a_accountant, b_accountant):
    # Hai công ty có thể trùng số PO/HĐ/GRN; kết quả đối soát không được dùng chung.
    a_batch = await upload_xml_set(client, a_accountant)
    b_batch = await upload_xml_set(client, b_accountant)
    a_items = (await client.get("/api/v1/uploads/batches", headers=a_accountant)).json()["items"]
    b_items = (await client.get("/api/v1/uploads/batches", headers=b_accountant)).json()["items"]
    a_result = next(item for item in a_items if item["id"] == a_batch["id"])
    b_result = next(item for item in b_items if item["id"] == b_batch["id"])
    assert a_result["reconciliation_status"] == "matched"
    assert b_result["reconciliation_status"] == "matched"
    # Cùng mã bộ trong ngày là bình thường vì đánh số riêng theo từng công ty.
    assert a_result["batch_number"] == b_result["batch_number"]


@pytest.mark.asyncio
async def test_users_and_thresholds_are_listed_per_company(client, a_chief, b_chief):
    a_users = {u["email"] for u in (await client.get("/api/v1/auth/users", headers=a_chief)).json()["items"]}
    b_users = {u["email"] for u in (await client.get("/api/v1/auth/users", headers=b_chief)).json()["items"]}
    assert "b.chief@isolation.test" not in a_users
    assert "chief.accountant@docusync.ai" not in b_users
    assert "b.accountant@isolation.test" in b_users

    a_thresholds = (await client.get("/api/v1/thresholds", headers=a_chief)).json()
    b_thresholds = (await client.get("/api/v1/thresholds", headers=b_chief)).json()
    assert len(a_thresholds) == len(b_thresholds) == 2
    assert {t["id"] for t in a_thresholds}.isdisjoint({t["id"] for t in b_thresholds})


def test_database_blocks_reads_and_writes_across_companies_even_without_app_filters():
    # Lớp bảo vệ thứ hai: kể cả khi code quên lọc, Postgres vẫn không trả về dòng của công ty khác.
    with SessionLocal() as db:
        use_system_context(db, ORG_B_ID)
        b_batch = DocumentBatch(organization_id=ORG_B_ID, batch_number="BATCH_RLS_B", status="incomplete")
        db.add(b_batch)
        db.commit()
        b_id = b_batch.id

    with SessionLocal() as db:
        set_organization_context(db, DEMO_ORGANIZATION_ID)
        assert db.get(DocumentBatch, b_id) is None
        assert db.query(Threshold).filter(Threshold.organization_id == ORG_B_ID).count() == 0
        # Ghi dữ liệu mang công ty khác cũng bị chặn (WITH CHECK).
        db.add(DocumentBatch(organization_id=ORG_B_ID, batch_number="BATCH_RLS_FORGED", status="incomplete"))
        with pytest.raises(Exception):
            db.commit()

    with SessionLocal() as db:
        set_organization_context(db, None)
        assert db.query(DocumentBatch).count() == 0

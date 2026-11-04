"""Pháp lý và quyền dữ liệu: đồng ý điều khoản có phiên bản, tắt AI, xuất toàn bộ dữ liệu, xóa công ty sau 30 ngày."""

import io
import uuid
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text

from src.api.privacy import delete_uploaded_file_from_storage, purge_storage_dirs
from src.database import SessionLocal, use_system_context
from src.models.billing import Payment
from src.models.organization import Organization
from src.models.reconciliation import DocumentBatch, UploadedFile
from src.models.user import User
from src.services.privacy import TERMS_VERSION, due_for_deletion, purge_organization
from tests.test_api.test_billing_and_limits import PASSWORD, XML_SET, login, make_company, upload

XML_FILES = (("po", "01_purchase_order.xml"), ("grn", "02_goods_receipt.xml"), ("invoice", "03_invoice.xml"))


async def upload_xml_set(client, headers):
    batch = (await client.post("/api/v1/uploads/batches", headers=headers)).json()
    for doc_type, name in XML_FILES:
        response = await upload(client, headers, batch["id"], name, doc_type)
        assert response.status_code == 200, response.text
    return batch


@pytest.mark.asyncio
async def test_legal_info_is_public(client):
    response = await client.get("/api/v1/legal")
    assert response.status_code == 200
    assert response.json()["terms_version"] == TERMS_VERSION
    assert response.json()["ai_providers"]


@pytest.mark.asyncio
async def test_users_who_never_accepted_the_current_terms_are_asked_once(client):
    _, _, accountant = make_company()
    headers = await login(client, accountant)
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()
    assert me["terms_acceptance_required"] is True
    accepted = await client.post("/api/v1/auth/terms/accept", headers=headers)
    assert accepted.json()["terms_acceptance_required"] is False
    with SessionLocal() as db:
        use_system_context(db)
        user = db.scalars(select(User).where(User.email == accountant)).one()
        assert user.terms_version == TERMS_VERSION
        assert user.terms_accepted_at is not None


@pytest.mark.asyncio
async def test_chief_can_turn_off_ai_so_only_xml_is_accepted(client, monkeypatch):
    calls = []
    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", lambda *args: calls.append(args))
    _, chief, accountant = make_company()
    chief_headers = await login(client, chief)
    accountant_headers = await login(client, accountant)
    forbidden = await client.patch("/api/v1/privacy/settings", headers=accountant_headers, json={"ai_enabled": False})
    assert forbidden.status_code == 403
    off = await client.patch("/api/v1/privacy/settings", headers=chief_headers, json={"ai_enabled": False})
    assert off.json()["ai_enabled"] is False
    me = (await client.get("/api/v1/auth/me", headers=accountant_headers)).json()
    assert me["organization"]["ai_enabled"] is False

    batch = (await client.post("/api/v1/uploads/batches", headers=accountant_headers)).json()
    pdf = await upload(client, accountant_headers, batch["id"], "po.pdf", "po", b"%PDF-1.4 x", "application/pdf")
    assert pdf.status_code == 422
    assert "chỉ nhận file XML" in pdf.json()["detail"]
    assert calls == []  # không gửi file ra dịch vụ AI
    monkeypatch.undo()
    xml = await upload(client, accountant_headers, batch["id"], "01_purchase_order.xml", "po")
    assert xml.status_code == 200


@pytest.mark.asyncio
async def test_export_contains_the_company_data_and_nothing_from_other_companies(client):
    _, chief, accountant = make_company(plan="pro")
    _, other_chief, other_accountant = make_company(plan="pro")
    await upload_xml_set(client, await login(client, accountant))
    await upload_xml_set(client, await login(client, other_accountant))

    assert (await client.get("/api/v1/privacy/export", headers=await login(client, accountant))).status_code == 403
    response = await client.get("/api/v1/privacy/export", headers=await login(client, chief))
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = archive.namelist()
    assert {"README.txt", "cong_ty.json", "nguoi_dung.csv", "bo_doi_soat.csv", "nhat_ky.csv"} <= set(names)
    originals = [name for name in names if name.startswith("chung_tu/") and name.endswith(".xml")]
    assert len(originals) == 3
    po = next(name for name in originals if "/" in name and "_po_" in name)
    assert archive.read(po) == (XML_SET / "01_purchase_order.xml").read_bytes()
    assert any(name.endswith(".xml.json") for name in names)
    people = archive.read("nguoi_dung.csv").decode("utf-8-sig")
    assert chief in people and accountant in people
    assert other_chief not in people and other_accountant not in people
    with SessionLocal() as db:
        use_system_context(db)
        assert db.scalar(text("SELECT count(*) FROM audit_logs WHERE action = 'DATA_EXPORTED'")) >= 1


@pytest.mark.asyncio
async def test_deletion_request_needs_confirmation_and_can_be_cancelled(client, monkeypatch):
    sent = []
    monkeypatch.setattr("src.api.privacy.send_deletion_scheduled_email", lambda *args: sent.append(args) or True)
    org_id, chief, _ = make_company()
    headers = await login(client, chief)
    with SessionLocal() as db:
        use_system_context(db)
        name = db.get(Organization, org_id).name

    wrong_password = {"password": "sai-mat-khau-99", "confirm_name": name}
    assert (await client.post("/api/v1/privacy/deletion", headers=headers, json=wrong_password)).status_code == 400
    wrong_name = {"password": PASSWORD, "confirm_name": "Công ty khác"}
    assert (await client.post("/api/v1/privacy/deletion", headers=headers, json=wrong_name)).status_code == 400

    body = {"password": PASSWORD, "confirm_name": name.upper()}
    scheduled = await client.post("/api/v1/privacy/deletion", headers=headers, json=body)
    assert scheduled.status_code == 200
    when = datetime.fromisoformat(scheduled.json()["deletion_scheduled_for"])
    assert timedelta(days=29) < when - datetime.now(UTC) <= timedelta(days=30)
    assert len(sent) == 1
    assert (await client.post("/api/v1/privacy/deletion", headers=headers, json=body)).status_code == 409

    cancelled = await client.delete("/api/v1/privacy/deletion", headers=headers)
    assert cancelled.json()["deletion_scheduled_for"] is None
    with SessionLocal() as db:
        use_system_context(db)
        assert org_id not in {organization.id for organization in due_for_deletion(db)}


@pytest.mark.asyncio
async def test_due_deletion_purges_everything_including_archives_but_keeps_payments(client):
    org_id, chief, accountant = make_company(plan="pro")
    keep_org, keep_chief, keep_accountant = make_company(plan="pro")
    accountant_headers = await login(client, accountant)
    chief_headers = await login(client, chief)
    batch = await upload_xml_set(client, accountant_headers)
    approve = await client.post(f"/api/v1/uploads/batches/{batch['id']}/approve", headers=accountant_headers)
    assert approve.status_code == 200, approve.text
    final = await client.post(f"/api/v1/uploads/batches/{batch['id']}/final-approve", headers=chief_headers)
    assert final.json()["status"] == "final_approved"
    await upload_xml_set(client, await login(client, keep_accountant))

    with SessionLocal() as db:
        use_system_context(db, org_id)
        db.add(
            Payment(
                id=uuid.uuid4(),
                organization_id=org_id,
                code=f"DSA{uuid.uuid4().hex[:8].upper()}",
                plan="pro",
                months=1,
                amount=1,
                status="paid",
                expires_at=datetime.now(UTC),
            )
        )
        db.get(Organization, org_id).deletion_scheduled_for = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()

    with SessionLocal() as db:
        use_system_context(db)
        due = [organization for organization in due_for_deletion(db) if organization.id == org_id]
        assert due
        counts = purge_organization(db, due[0], delete_uploaded_file_from_storage, purge_storage_dirs(org_id))
    assert counts["document_batches"] == 1
    assert counts["uploaded_files"] == 3
    assert counts["users_anonymized"] == 2

    with SessionLocal() as db:
        use_system_context(db)
        assert db.scalar(select(func.count(DocumentBatch.id)).where(DocumentBatch.organization_id == org_id)) == 0
        assert db.scalar(select(func.count(UploadedFile.id)).where(UploadedFile.organization_id == org_id)) == 0
        assert db.scalar(select(func.count(Payment.id)).where(Payment.organization_id == org_id)) == 1
        assert db.get(Organization, org_id).status == "deleted"
        emails = set(db.scalars(select(User.email).where(User.organization_id == org_id)).all())
        assert chief not in emails and accountant not in emails
        assert db.scalar(select(func.count(DocumentBatch.id)).where(DocumentBatch.organization_id == keep_org)) == 1

    # Tài khoản cũ không đăng nhập được, phiên đang mở bị thu hồi; công ty khác vẫn bình thường.
    failed = await client.post("/api/v1/auth/login", json={"email": chief, "password": PASSWORD})
    assert failed.status_code == 401
    assert (await client.get("/api/v1/uploads/batches", headers=chief_headers)).status_code in (401, 403)
    assert (await client.get("/api/v1/uploads/batches", headers=await login(client, keep_chief))).status_code == 200

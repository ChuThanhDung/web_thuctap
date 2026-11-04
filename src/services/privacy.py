"""Quyền đối với dữ liệu (Nghị định 13/2023/NĐ-CP): đồng ý điều khoản có phiên bản, xuất toàn bộ dữ liệu công ty,
xóa công ty theo yêu cầu.

Xóa công ty: kế toán trưởng yêu cầu → 30 ngày để đổi ý (và xuất dữ liệu) → scripts/process_company_deletions.py xóa
hẳn chứng từ, kết quả đối soát, nhật ký; tài khoản người dùng được ẩn danh (giữ dòng để không vỡ khóa ngoại). Đơn
thanh toán giữ lại vì là chứng từ thu tiền của nhà cung cấp dịch vụ.
"""

import csv
import io
import json
import logging
import shutil
import tempfile
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session, selectinload

from src.models.audit_log import AuditLog
from src.models.organization import Organization
from src.models.reconciliation import DocumentBatch, UploadedFile
from src.models.user import User
from src.models.user_session import UserSession

logger = logging.getLogger(__name__)

# Đổi khi sửa nội dung Điều khoản / Chính sách bảo vệ dữ liệu (frontend/src/legal/content.js): người dùng được hỏi
# đồng ý lại ở lần mở app sau.
TERMS_VERSION = "2026-11-04"
DELETION_GRACE_DAYS = 30

# Bảng nghiệp vụ xóa khi xóa công ty, theo thứ tự khóa ngoại (bảng con trước).
PURGE_TABLES = (
    "line_items",
    "reconciliation_cases",
    "purchase_order_items",
    "purchase_orders",
    "goods_receipt_note_items",
    "goods_receipt_notes",
    "uploaded_document_extractions",
    "uploaded_files",
    "notifications",
    "document_batch_histories",
    "user_invitations",
    "thresholds",
    "usage_counters",
    "document_batches",
    "audit_logs",
    "agent_runs",
)


def record_terms_acceptance(user: User, version: str = TERMS_VERSION, when: datetime | None = None) -> None:
    user.terms_version = version
    user.terms_accepted_at = when or datetime.now(UTC)


def terms_acceptance_required(user: User) -> bool:
    return user.terms_version != TERMS_VERSION


# --- Xuất dữ liệu -------------------------------------------------------------------------------------------------


def _csv(rows: list[dict]) -> bytes:
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    # BOM để Excel mở đúng tiếng Việt.
    return ("﻿" + buffer.getvalue()).encode("utf-8")


def _iso(value) -> str:
    return value.isoformat() if value else ""


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)[:120]


EXPORT_README = """Dữ liệu xuất từ DocuSync AI
===========================

- cong_ty.json: thông tin công ty, gói dịch vụ.
- nguoi_dung.csv: tài khoản (không có mật khẩu).
- bo_doi_soat.csv: các bộ đối soát và trạng thái duyệt.
- chung_tu/<mã bộ>/: file gốc đã tải lên, kèm <tên file>.json là dữ liệu hệ thống đọc được từ file đó.
- nhat_ky.csv: nhật ký thao tác của công ty.

Theo Luật Kế toán, chứng từ kế toán dùng ghi sổ phải được lưu tối thiểu 10 năm. Hãy giữ bản xuất này nếu công ty
ngừng dùng dịch vụ hoặc yêu cầu xóa dữ liệu.
"""


def build_export(db: Session, organization: Organization, read_file) -> Path:
    """Tạo file ZIP chứa toàn bộ dữ liệu của công ty. Phiên phải ở ngữ cảnh công ty đó (RLS).

    read_file(upload) trả về nội dung file gốc hoặc None nếu không đọc được. Trả về đường dẫn file tạm (người gọi xóa).
    """
    handle = tempfile.NamedTemporaryFile(prefix="docusync-export-", suffix=".zip", delete=False)
    handle.close()
    path = Path(handle.name)
    users = db.scalars(select(User).options(selectinload(User.role)).order_by(User.created_at)).all()
    users_by_public_id = {user.public_id: user.email for user in users}
    batches = db.scalars(
        select(DocumentBatch).options(selectinload(DocumentBatch.files)).order_by(DocumentBatch.created_at)
    ).all()

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", EXPORT_README)
        archive.writestr(
            "cong_ty.json",
            json.dumps(
                {
                    "id": str(organization.id),
                    "ten": organization.name,
                    "ma_so_thue": organization.tax_id,
                    "goi": organization.plan,
                    "goi_het_han": _iso(organization.plan_expires_at),
                    "dung_thu_den": _iso(organization.trial_ends_at),
                    "ngay_tao": _iso(organization.created_at),
                    "ngay_xuat": datetime.now(UTC).isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
        archive.writestr(
            "nguoi_dung.csv",
            _csv(
                [
                    {
                        "email": user.email,
                        "ho_ten": user.full_name,
                        "vai_tro": user.role.code,
                        "trang_thai": user.status,
                        "ma_nhan_vien": user.employee_code or "",
                        "so_dien_thoai": user.phone or "",
                        "cccd": user.citizen_id or "",
                        "dia_chi": user.address or "",
                        "ngay_sinh": _iso(user.date_of_birth),
                        "ngay_tao": _iso(user.created_at),
                    }
                    for user in users
                ]
            ),
        )
        batch_rows = []
        for batch in batches:
            batch_rows.append(
                {
                    "ma_bo": batch.batch_number,
                    "trang_thai": batch.status,
                    "phien_ban": batch.version,
                    "ghi_chu": batch.note or "",
                    "ly_do_tu_choi": batch.rejection_note or "",
                    "nguoi_tao": users_by_public_id.get(batch.created_by_id, ""),
                    "ke_toan_vien_duyet": users_by_public_id.get(batch.approved_by_id, ""),
                    "ke_toan_truong_duyet": users_by_public_id.get(batch.chief_approved_by_id, ""),
                    "ngay_tao": _iso(batch.created_at),
                    "so_file": len(batch.files),
                }
            )
            folder = f"chung_tu/{_safe(batch.batch_number)}_{batch.id}"
            for upload in batch.files:
                name = f"{folder}/{upload.id}_{_safe(Path(upload.storage_key).name)}"
                content = read_file(upload)
                if content is None:
                    archive.writestr(name + ".KHONG_DOC_DUOC.txt", "File gốc không còn trên máy chủ.")
                else:
                    archive.writestr(name, content)
                extraction = upload.ai_extraction
                if extraction is not None:
                    archive.writestr(
                        name + ".json",
                        json.dumps(
                            {
                                "loai_chung_tu": upload.doc_type,
                                "trang_thai_doc": extraction.status,
                                "do_tin_cay": float(extraction.confidence)
                                if extraction.confidence is not None
                                else None,
                                "cach_doc": extraction.model_name,
                                "du_lieu": extraction.extracted_data,
                            },
                            ensure_ascii=False,
                            indent=2,
                            default=str,
                        ),
                    )
        archive.writestr("bo_doi_soat.csv", _csv(batch_rows))
        logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at)).all()
        user_emails = {user.id: user.email for user in users}
        archive.writestr(
            "nhat_ky.csv",
            _csv(
                [
                    {
                        "thoi_diem": _iso(log.created_at),
                        "nguoi_thuc_hien": user_emails.get(log.user_id, ""),
                        "thao_tac": log.action,
                        "doi_tuong": f"{log.target_type or ''} {log.target_id or ''}".strip(),
                        "chi_tiet": json.dumps(log.details, ensure_ascii=False, default=str) if log.details else "",
                        "ip": log.ip_address or "",
                    }
                    for log in logs
                ]
            ),
        )
    return path


# --- Xóa công ty --------------------------------------------------------------------------------------------------


def schedule_deletion(organization: Organization, user: User, now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    organization.deletion_requested_at = now
    organization.deletion_requested_by = user.id
    organization.deletion_scheduled_for = now + timedelta(days=DELETION_GRACE_DAYS)
    return organization.deletion_scheduled_for


def cancel_deletion(organization: Organization) -> None:
    organization.deletion_requested_at = None
    organization.deletion_requested_by = None
    organization.deletion_scheduled_for = None


def due_for_deletion(db: Session, now: datetime | None = None) -> list[Organization]:
    return db.scalars(
        select(Organization).where(
            Organization.deleted_at.is_(None),
            Organization.deletion_scheduled_for.is_not(None),
            Organization.deletion_scheduled_for <= (now or datetime.now(UTC)),
        )
    ).all()


def purge_organization(db: Session, organization: Organization, delete_file, storage_dirs: list[Path]) -> dict:
    """Xóa hẳn dữ liệu của công ty. Phiên ở chế độ hệ thống. delete_file(upload) xóa file lưu trữ ngoài (S3/R2);
    storage_dirs là các thư mục cục bộ của công ty sẽ bị xóa cả thư mục. Trả về số dòng đã xóa theo bảng."""
    org_id = organization.id
    for upload in db.scalars(select(UploadedFile).where(UploadedFile.organization_id == org_id)).all():
        try:
            delete_file(upload)
        except Exception:  # noqa: BLE001 - file mất rồi thì vẫn xóa tiếp phần còn lại
            logger.warning("Không xóa được file %s khi xóa công ty %s", upload.storage_key, org_id)

    # Bộ đã duyệt cuối được trigger chặn xóa (migration 0002): hạ trạng thái trước, đây là thao tác có ghi nhận.
    db.execute(
        update(DocumentBatch)
        .where(DocumentBatch.organization_id == org_id, DocumentBatch.status == "final_approved")
        .values(status="purged")
    )
    counts = {}
    for table in PURGE_TABLES:
        result = db.execute(text(f"DELETE FROM {table} WHERE organization_id = :org"), {"org": org_id})  # nosec B608
        counts[table] = result.rowcount

    users = db.scalars(select(User).where(User.organization_id == org_id)).all()
    now = datetime.now(UTC)
    for user in users:
        db.execute(update(UserSession).where(UserSession.user_id == user.id).values(revoked_at=now))
        user.email = f"deleted-{user.id}@deleted.invalid"
        user.full_name = "Tài khoản đã xóa"
        user.password_hash = "!"
        user.phone = None
        user.citizen_id = None
        user.citizen_id_hash = None
        user.address = None
        user.date_of_birth = None
        user.avatar_url = None
        user.totp_secret = None
        user.totp_enabled_at = None
        user.totp_recovery_codes = None
        user.status = "DEACTIVE"
    counts["users_anonymized"] = len(users)

    organization.status = "deleted"
    organization.deleted_at = now
    db.commit()

    for directory in storage_dirs:
        shutil.rmtree(directory, ignore_errors=True)
    return counts


def new_export_filename(organization: Organization) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    return f"docusync-{_safe(organization.name)[:40]}-{stamp}-{uuid.uuid4().hex[:6]}.zip"

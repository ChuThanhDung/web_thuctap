import hashlib
import logging
import mimetypes
import os
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from src.api.auth import get_current_user
from src.config import get_settings
from src.database import get_db
from src.models.reconciliation import (
    DocumentBatch,
    DocumentBatchHistory,
    LineItem,
    ReconciliationCase,
    UploadedDocumentExtraction,
    UploadedFile,
)
from src.models.schemas import (
    DocumentBatchHistoryOut,
    DocumentBatchListResponse,
    DocumentBatchOut,
    DocumentBatchRejectRequest,
    DocumentBatchUpdateRequest,
    MessageResponse,
    UploadedDocumentExtractionOut,
    UploadedFileListResponse,
    UploadedFileOut,
)
from src.models.user import User
from src.services.auth import write_audit_log
from src.services.document_ai_extractor import (
    DocumentAiAnalysis,
    UnreadableDocumentError,
    analyze_uploaded_document,
)
from src.services.email import is_smtp_configured, send_batch_rejected_email
from src.services.notifications import (
    create_notification,
    create_notifications_for_role,
    publish_notifications,
)
from src.services.reconciliation_engine import reconcile_documents
from src.services.s3_service import (
    delete_file_from_object_storage,
    download_file_from_object_storage,
    list_object_storage_keys,
    upload_file_to_object_storage,
)

router = APIRouter(prefix="/uploads", tags=["Uploads & Ingestion"])
logger = logging.getLogger(__name__)
ALLOWED_DOC_TYPES = {"invoice", "po", "grn"}
AUTO_DOC_TYPE = "auto"
REQUIRED_DOC_TYPES = ["po", "invoice", "grn"]
DUPLICATE_UPLOAD_MESSAGE = "File này đã được tải lên trong bộ chứng từ hiện tại. Vui lòng kiểm tra lại."
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_STORAGE_ROOT = PROJECT_ROOT / "storage" / "upload"
INVOICE_ARCHIVE_ROOT = PROJECT_ROOT / "invoice"
INLINE_CONTENT_TYPES_BY_EXT = {
    "pdf": "application/pdf",
    "xml": "application/xml; charset=utf-8",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
}


def normalize_selected_doc_type(doc_type: str | None) -> str:
    storage_doc_type = (doc_type or "invoice").lower().strip()
    if storage_doc_type not in ALLOWED_DOC_TYPES:
        raise ValueError("Loai tai lieu khong hop le. Vui long chon invoice, po hoac grn.")
    return storage_doc_type


def normalize_upload_doc_type(doc_type: str | None) -> str:
    requested_doc_type = (doc_type or "invoice").lower().strip()
    if requested_doc_type == AUTO_DOC_TYPE:
        return AUTO_DOC_TYPE
    return normalize_selected_doc_type(requested_doc_type)


def build_next_batch_number(db: Session) -> str:
    today = datetime.now()
    date_part = today.strftime("%d_%m_%Y")
    batch_prefix = f"BATCH_{date_part}_"
    existing_numbers = db.scalars(
        select(DocumentBatch.batch_number).where(DocumentBatch.batch_number.like(f"{batch_prefix}%"))
    ).all()
    next_index = 1
    for batch_number in existing_numbers:
        index_text = batch_number.removeprefix(batch_prefix)
        if index_text.isdigit():
            next_index = max(next_index, int(index_text) + 1)
    return f"{batch_prefix}{next_index:02d}"


def create_document_batch(db: Session, current_user: User | None) -> DocumentBatch:
    batch = DocumentBatch(
        batch_number=build_next_batch_number(db),
        created_by_id=current_user.public_id if current_user else None,
        status="incomplete",
    )
    db.add(batch)
    db.flush()
    return batch


def get_or_create_document_batch(
    db: Session,
    batch_id: int | None,
    current_user: User | None,
) -> DocumentBatch:
    if batch_id is None:
        return create_document_batch(db, current_user)

    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")
    return batch


def get_active_batch_files(batch: DocumentBatch, db: Session | None = None) -> list[UploadedFile]:
    if not batch:
        return []
    if db is not None and batch.id is not None:
        uploads = (
            db.query(UploadedFile)
            .filter(UploadedFile.batch_id == batch.id)
            .order_by(UploadedFile.id.asc())
            .all()
        )
    else:
        uploads = list(batch.files or [])
    if not uploads:
        return []

    by_type: dict[str, list[UploadedFile]] = {}
    for f in uploads:
        if f.doc_type:
            by_type.setdefault(f.doc_type, []).append(f)

    active_files: list[UploadedFile] = []
    for doc_type, files_list in by_type.items():
        if not files_list:
            continue
        max_version = max((getattr(f, "version", 1) or 1) for f in files_list)
        for f in files_list:
            if (getattr(f, "version", 1) or 1) == max_version:
                active_files.append(f)

    unclassified = [f for f in uploads if not f.doc_type]
    if unclassified:
        max_ver_unclass = max((getattr(f, "version", 1) or 1) for f in unclassified)
        active_files.extend([f for f in unclassified if (getattr(f, "version", 1) or 1) == max_ver_unclass])

    active_files.sort(key=lambda f: f.id)
    return active_files


def snapshot_batch_history(
    db: Session,
    batch: DocumentBatch,
    rejection_note: str | None = None,
    rejected_by: User | None = None,
) -> DocumentBatchHistory:
    active_files = get_active_batch_files(batch, db=db)
    files_data = [to_uploaded_file_out(f).model_dump(mode="json") for f in active_files]

    current_version = batch.version or 1
    existing = (
        db.query(DocumentBatchHistory)
        .filter(DocumentBatchHistory.batch_id == batch.id, DocumentBatchHistory.version == current_version)
        .first()
    )
    if existing:
        if rejection_note:
            existing.rejection_note = rejection_note
        if rejected_by:
            existing.rejected_by_id = rejected_by.public_id
            existing.rejected_by_name = rejected_by.full_name
            existing.rejected_at = datetime.now()
        existing.status = "rejected" if (rejection_note or batch.status == "rejected") else batch.status
        if files_data:
            existing.files_data = files_data
        db.add(existing)
        db.flush()
        return existing

    history_entry = DocumentBatchHistory(
        batch_id=batch.id,
        version=current_version,
        status="rejected" if (rejection_note or batch.status == "rejected") else batch.status,
        rejection_note=rejection_note or batch.rejection_note,
        rejected_by_id=rejected_by.public_id if rejected_by else None,
        rejected_by_name=rejected_by.full_name if rejected_by else None,
        rejected_at=datetime.now() if (rejected_by or rejection_note) else None,
        files_data=files_data,
        note=batch.note,
    )
    db.add(history_entry)
    db.flush()
    return history_entry


def update_batch_status(db: Session, batch: DocumentBatch) -> None:
    if batch.status in ("approved", "final_approved"):
        return

    active_files = get_active_batch_files(batch, db=db)
    extracted_doc_types = {
        upload.doc_type
        for upload in active_files
        if upload.doc_type
        and (
            (upload.ai_extraction and upload.ai_extraction.is_correct_type and upload.ai_extraction.extracted_data)
            or (not upload.ai_extraction and upload.doc_type)
        )
    }
    is_ready = all(doc_type in extracted_doc_types for doc_type in REQUIRED_DOC_TYPES)
    if is_ready:
        batch.status = "ready"
    else:
        batch.status = "incomplete"
    batch.updated_at = datetime.now()
    db.add(batch)


def require_accountant(current_user: User) -> None:
    if current_user.role.code != "accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán viên mới có quyền duyệt batch đối soát.",
        )


def can_access_batch(current_user: User, batch: DocumentBatch) -> bool:
    if current_user.role.code == "chief_accountant":
        return True
    if current_user.role.code == "accountant":
        return (
            batch.created_by_id == current_user.public_id
            or batch.approved_by_id == current_user.public_id
            or any(upload.uploaded_by_id == current_user.public_id for upload in batch.files)
        )
    return False


def require_batch_access(current_user: User, batch: DocumentBatch) -> None:
    if not can_access_batch(current_user, batch):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Khong tim thay bo doi soat.",
        )


def get_batch_rejection_recipient(db: Session, batch: DocumentBatch) -> User | None:
    recipient_public_id = batch.approved_by_id or batch.created_by_id
    if recipient_public_id is None:
        return None
    if batch.approved_by and batch.approved_by.public_id == recipient_public_id:
        return batch.approved_by
    if batch.created_by and batch.created_by.public_id == recipient_public_id:
        return batch.created_by
    return db.query(User).filter(User.public_id == recipient_public_id).first()


def get_url_origin(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def get_allowed_frontend_origins() -> list[str]:
    settings = get_settings()
    origins = [origin.strip().rstrip("/") for origin in settings.cors_origins.split(",") if origin.strip()]
    if settings.app_frontend_url:
        configured_origin = get_url_origin(settings.app_frontend_url)
        if configured_origin and configured_origin not in origins:
            origins.append(configured_origin)
    return origins


def get_frontend_base_url(request: Request) -> str:
    settings = get_settings()
    allowed_origins = get_allowed_frontend_origins()
    for header_name in ("origin", "referer"):
        origin = get_url_origin(request.headers.get(header_name))
        if origin and ("*" in allowed_origins or origin in allowed_origins):
            return origin

    configured_origin = get_url_origin(settings.app_frontend_url)
    if configured_origin:
        return configured_origin

    if settings.app_env == "production":
        deployed_origin = next((origin for origin in allowed_origins if origin.startswith("https://")), None)
        if deployed_origin:
            return deployed_origin

    return "http://localhost:3000"


def build_rejected_batch_url(request: Request, batch_id: int) -> str:
    query = urlencode({"overviewFilter": "rejected", "batchId": str(batch_id)})
    return f"{get_frontend_base_url(request)}/audit-trail?{query}"


def build_sequential_stored_filename_from_names(
    existing_filenames: list[str],
    selected_doc_type: str,
    file_ext: str,
    today: datetime | None = None,
) -> str:
    date_part = (today or datetime.now()).strftime("%d_%m_%Y")
    filename_prefix = f"{selected_doc_type}_{date_part}_"
    next_index = 1

    for filename in existing_filenames:
        stored_name = filename.rsplit("/", 1)[-1]
        if not stored_name.startswith(filename_prefix):
            continue
        stem = Path(stored_name).stem
        index_text = stem.removeprefix(filename_prefix)
        if index_text.isdigit():
            next_index = max(next_index, int(index_text) + 1)

    filename = f"{filename_prefix}{next_index:02d}"
    if file_ext:
        filename = f"{filename}.{file_ext}"
    return filename


def build_sequential_stored_filename(target_dir: Path, selected_doc_type: str, file_ext: str) -> str:
    existing_filenames: list[str] = []
    if target_dir.exists():
        for path in target_dir.iterdir():
            if path.is_file():
                existing_filenames.append(path.name)

    return build_sequential_stored_filename_from_names(existing_filenames, selected_doc_type, file_ext)


def save_uploaded_file_to_local_storage(content: bytes, filename: str, selected_doc_type: str) -> str:
    original_filename = os.path.basename(filename)
    file_ext = Path(original_filename).suffix.lower().lstrip(".")

    target_dir = UPLOAD_STORAGE_ROOT / selected_doc_type
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = build_sequential_stored_filename(target_dir, selected_doc_type, file_ext)
    target_path = target_dir / stored_filename
    target_path.write_bytes(content)

    return target_path.relative_to(PROJECT_ROOT).as_posix()


def save_invoice_file_to_archive(content: bytes, filename: str) -> str:
    original_filename = os.path.basename(filename)
    file_ext = Path(original_filename).suffix.lower().lstrip(".")

    INVOICE_ARCHIVE_ROOT.mkdir(parents=True, exist_ok=True)
    stored_filename = build_sequential_stored_filename(INVOICE_ARCHIVE_ROOT, "invoice", file_ext)
    target_path = INVOICE_ARCHIVE_ROOT / stored_filename
    target_path.write_bytes(content)

    try:
        return target_path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return target_path.as_posix()


def guess_inline_content_type(filename: str, provided_content_type: str | None = None) -> str:
    file_ext = Path(filename).suffix.lower().lstrip(".")
    if file_ext in INLINE_CONTENT_TYPES_BY_EXT:
        return INLINE_CONTENT_TYPES_BY_EXT[file_ext]

    guessed_content_type = mimetypes.guess_type(filename)[0]
    if guessed_content_type:
        return guessed_content_type

    if provided_content_type and provided_content_type != "application/octet-stream":
        return provided_content_type

    return "application/octet-stream"


def build_cloud_storage_key(filename: str, selected_doc_type: str) -> str:
    original_filename = os.path.basename(filename)
    file_ext = Path(original_filename).suffix.lower().lstrip(".")
    today = datetime.now()
    cloud_dir = f"uploads/{selected_doc_type}/{today.year}/{today.month:02d}/{today.day:02d}"
    date_part = today.strftime("%d_%m_%Y")
    existing_keys = list_object_storage_keys(f"{cloud_dir}/{selected_doc_type}_{date_part}_")
    stored_filename = build_sequential_stored_filename_from_names(existing_keys, selected_doc_type, file_ext, today)
    return f"{cloud_dir}/{stored_filename}"


def save_uploaded_file(content: bytes, filename: str, selected_doc_type: str, content_type: str) -> str:
    settings = get_settings()
    if settings.storage_provider in {"r2", "s3"}:
        storage_key = build_cloud_storage_key(filename, selected_doc_type)
        upload_file_to_object_storage(content, storage_key, guess_inline_content_type(filename, content_type))
        return storage_key

    return save_uploaded_file_to_local_storage(content, filename, selected_doc_type)


def format_file_size(storage_key: str) -> str:
    path = PROJECT_ROOT / storage_key
    if not path.exists():
        return "-"
    file_size_bytes = path.stat().st_size
    if file_size_bytes >= 1024 * 1024:
        return f"{file_size_bytes / (1024 * 1024):.1f} MB"
    return f"{file_size_bytes / 1024:.1f} KB"


def resolve_uploaded_file_path(storage_key: str) -> Path:
    file_path = (PROJECT_ROOT / storage_key).resolve()
    storage_root = UPLOAD_STORAGE_ROOT.resolve()
    if not file_path.is_file() or not file_path.is_relative_to(storage_root):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay file da tai len.")
    return file_path


def delete_uploaded_file_from_storage(upload: UploadedFile) -> None:
    settings = get_settings()
    if settings.storage_provider in {"r2", "s3"}:
        delete_file_from_object_storage(upload.storage_key)
        return

    file_path = (PROJECT_ROOT / upload.storage_key).resolve()
    storage_root = UPLOAD_STORAGE_ROOT.resolve()
    if not file_path.is_relative_to(storage_root):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay file da tai len.")
    file_path.unlink(missing_ok=True)


def calculate_content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def read_existing_upload_content(upload: UploadedFile) -> bytes | None:
    settings = get_settings()
    try:
        if settings.storage_provider in {"r2", "s3"}:
            content, _content_type = download_file_from_object_storage(upload.storage_key)
            return content

        file_path = resolve_uploaded_file_path(upload.storage_key)
        return file_path.read_bytes()
    except Exception:
        return None


def find_duplicate_upload_by_content(batch: DocumentBatch, content_hash: str) -> UploadedFile | None:
    for upload in batch.files or []:
        existing_content = read_existing_upload_content(upload)
        if existing_content is not None and calculate_content_hash(existing_content) == content_hash:
            return upload
    return None


def to_uploaded_file_out(upload: UploadedFile) -> UploadedFileOut:
    settings = get_settings()
    storage_path = Path(upload.storage_key)
    stored_filename = storage_path.name
    file_ext = storage_path.suffix.lower().lstrip(".")
    created_at = upload.created_at.strftime("%Y-%m-%d %H:%M:%S")
    ai_extraction = to_ai_extraction_out(upload.ai_extraction) if upload.ai_extraction else None
    return UploadedFileOut(
        id=upload.id,
        batch_id=upload.batch_id,
        doc_type=upload.doc_type,
        uploaded_by_id=upload.uploaded_by_id,
        uploaded_by_name=upload.uploaded_by.full_name if upload.uploaded_by else None,
        filename=stored_filename,
        original_filename=None,
        stored_filename=stored_filename,
        storage_provider=settings.storage_provider,
        storage_key=upload.storage_key,
        file_url=f"/api/v1/uploads/{upload.id}/file",
        content_type=None,
        file_ext=file_ext,
        size=format_file_size(upload.storage_key) if settings.storage_provider == "local" else "-",
        status="completed",
        progress=100,
        error_message=None,
        case_id=None,
        ai_extraction=ai_extraction,
        version=getattr(upload, "version", 1) or 1,
        created_at=created_at,
    )


def to_ai_extraction_out(extraction: UploadedDocumentExtraction) -> UploadedDocumentExtractionOut:
    return UploadedDocumentExtractionOut(
        id=extraction.id,
        expected_doc_type=extraction.expected_doc_type,
        detected_doc_type=extraction.detected_doc_type,
        is_correct_type=extraction.is_correct_type,
        confidence=extraction.confidence,
        status=extraction.status,
        validation_message=extraction.validation_message,
        model_name=extraction.model_name,
        extracted_data=extraction.extracted_data,
        created_at=extraction.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        updated_at=extraction.updated_at.strftime("%Y-%m-%d %H:%M:%S") if extraction.updated_at else None,
    )


def create_ai_extraction_record(
    db: Session,
    upload: UploadedFile,
    analysis: DocumentAiAnalysis,
) -> UploadedDocumentExtraction:
    extraction = UploadedDocumentExtraction(
        upload_id=upload.id,
        batch_id=upload.batch_id,
        expected_doc_type=analysis.expected_doc_type,
        detected_doc_type=analysis.detected_doc_type,
        is_correct_type=analysis.is_correct_type,
        confidence=analysis.confidence,
        status=analysis.status,
        validation_message=analysis.validation_message,
        model_name=analysis.model_name,
        extracted_data=analysis.extracted_data,
        raw_response=analysis.raw_response,
    )
    db.add(extraction)
    return extraction


def first_present(data: dict, *keys: str):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def normalize_extracted_document(doc_type: str, extracted_data: dict | None) -> dict:
    data = extracted_data if isinstance(extracted_data, dict) else {}
    normalized = {
        "type": doc_type,
        "document_number": first_present(data, "document_number", "number"),
        "po_number": first_present(data, "po_number", "purchase_order_number", "document_number"),
        "invoice_number": first_present(data, "invoice_number", "document_number"),
        "grn_number": first_present(data, "grn_number", "document_number"),
        "supplier_name": first_present(data, "supplier_name", "vendor_name", "seller_name"),
        "supplier_tax_id": first_present(data, "supplier_tax_id", "tax_id", "vendor_tax_id"),
        "buyer_name": first_present(data, "buyer_name", "customer_name"),
        "total_amount": first_present(data, "total_amount", "total", "grand_total", "payable_amount"),
        "vat_rate_pct": first_present(data, "vat_rate_pct", "tax_rate_pct"),
        "line_items": [],
    }
    if doc_type == "invoice":
        normalized["invoice_number"] = first_present(data, "invoice_number", "document_number")
    elif doc_type == "po":
        normalized["po_number"] = first_present(data, "po_number", "document_number")
    elif doc_type == "grn":
        normalized["grn_number"] = first_present(data, "grn_number", "document_number")

    line_items = data.get("line_items") if isinstance(data.get("line_items"), list) else []
    for idx, item in enumerate(line_items, 1):
        if not isinstance(item, dict):
            continue
        normalized["line_items"].append(
            {
                "row_index": first_present(item, "row_index") or idx,
                "sku": first_present(item, "sku", "item_sku", "code"),
                "item_name": first_present(item, "item_name", "name", "description") or "",
                "unit": first_present(item, "unit", "uom"),
                "qty": first_present(item, "qty", "quantity"),
                "price": first_present(item, "price", "unit_price"),
                "vat_rate_pct": first_present(item, "vat_rate_pct", "tax_rate_pct"),
                "amount": first_present(item, "amount", "line_total", "total_amount"),
            }
        )

    return normalized


def to_decimal_or_none(value) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def unique_join(values: list, max_length: int | None = None) -> str | None:
    seen: list[str] = []
    for value in values:
        if value in (None, ""):
            continue
        text = str(value).strip()
        if text and text not in seen:
            seen.append(text)
    if not seen:
        return None
    joined = ", ".join(seen)
    if max_length and len(joined) > max_length:
        suffix = "..."
        return f"{joined[: max_length - len(suffix)].rstrip(', ')}{suffix}"
    return joined


def normalize_item_key(item: dict) -> tuple[str, str]:
    sku = str(item.get("sku") or "").strip().lower()
    name = " ".join(str(item.get("item_name") or "").strip().lower().split())
    return (sku, "") if sku else ("", name)


def aggregate_line_items(line_items: list[dict]) -> list[dict]:
    grouped: dict[tuple[str, str], dict] = {}
    passthrough: list[dict] = []
    for item in line_items:
        key = normalize_item_key(item)
        if not key[0] and not key[1]:
            passthrough.append({**item, "row_index": len(passthrough) + 1})
            continue

        qty = to_decimal_or_none(item.get("qty")) or Decimal("0")
        amount = to_decimal_or_none(item.get("amount"))
        price = to_decimal_or_none(item.get("price"))
        if amount is None and price is not None:
            amount = qty * price

        if key not in grouped:
            grouped[key] = {
                **item,
                "qty": qty,
                "amount": amount,
                "_weighted_price_amount": amount or Decimal("0"),
                "_weighted_price_qty": qty if amount is not None else Decimal("0"),
            }
            continue

        current = grouped[key]
        current["qty"] = (to_decimal_or_none(current.get("qty")) or Decimal("0")) + qty
        current_amount = to_decimal_or_none(current.get("amount"))
        if current_amount is not None or amount is not None:
            current["amount"] = (current_amount or Decimal("0")) + (amount or Decimal("0"))
        current["_weighted_price_amount"] = current.get("_weighted_price_amount", Decimal("0")) + (amount or Decimal("0"))
        current["_weighted_price_qty"] = current.get("_weighted_price_qty", Decimal("0")) + (qty if amount is not None else Decimal("0"))

    aggregated = list(grouped.values()) + passthrough
    for idx, item in enumerate(aggregated, 1):
        weighted_qty = item.pop("_weighted_price_qty", Decimal("0"))
        weighted_amount = item.pop("_weighted_price_amount", Decimal("0"))
        if weighted_qty > 0:
            item["price"] = weighted_amount / weighted_qty
        item["row_index"] = idx
    return aggregated


def aggregate_extracted_documents(doc_type: str, uploads: list[UploadedFile]) -> dict:
    normalized_docs = [
        normalize_extracted_document(doc_type, upload.ai_extraction.extracted_data)
        for upload in uploads
        if upload.ai_extraction and upload.ai_extraction.is_correct_type and upload.ai_extraction.extracted_data
    ]
    if not normalized_docs:
        return normalize_extracted_document(doc_type, None)

    total_amounts = [to_decimal_or_none(doc.get("total_amount")) for doc in normalized_docs]
    total_amount = sum((amount for amount in total_amounts if amount is not None), Decimal("0"))
    has_total_amount = any(amount is not None for amount in total_amounts)

    line_items = []
    for doc in normalized_docs:
        document_number = doc.get("document_number") or doc.get(f"{doc_type}_number")
        for item in doc.get("line_items", []):
            next_item = dict(item)
            next_item["row_index"] = len(line_items) + 1
            if document_number:
                next_item["source_document_number"] = document_number
            line_items.append(next_item)

    aggregated = {
        "type": doc_type,
        "document_number": unique_join([doc.get("document_number") for doc in normalized_docs], max_length=50),
        "po_number": unique_join([doc.get("po_number") for doc in normalized_docs], max_length=50),
        "invoice_number": unique_join([doc.get("invoice_number") for doc in normalized_docs], max_length=50),
        "grn_number": unique_join([doc.get("grn_number") for doc in normalized_docs], max_length=50),
        "supplier_name": None,
        "supplier_tax_id": None,
        "buyer_name": None,
        "total_amount": total_amount if has_total_amount else None,
        "vat_rate_pct": next((doc.get("vat_rate_pct") for doc in normalized_docs if doc.get("vat_rate_pct") not in (None, "")), None),
        "line_items": aggregate_line_items(line_items),
    }
    for key in ("supplier_name", "supplier_tax_id", "buyer_name"):
        aggregated[key] = next((doc.get(key) for doc in normalized_docs if doc.get(key) not in (None, "")), None)
    if doc_type == "invoice":
        aggregated["document_number"] = aggregated["invoice_number"] or aggregated["document_number"]
    elif doc_type == "po":
        aggregated["document_number"] = aggregated["po_number"] or aggregated["document_number"]
    elif doc_type == "grn":
        aggregated["document_number"] = aggregated["grn_number"] or aggregated["document_number"]
    return aggregated


def build_next_case_number(db: Session) -> str:
    existing_case_numbers = db.scalars(
        select(ReconciliationCase.case_number).where(ReconciliationCase.case_number.like("DOC-%"))
    ).all()
    next_index = 1
    for case_number in existing_case_numbers:
        suffix = str(case_number).removeprefix("DOC-")
        if suffix.isdigit():
            next_index = max(next_index, int(suffix) + 1)
    return f"DOC-{next_index:04d}"


def find_existing_reconciliation_case(db: Session, result: dict) -> ReconciliationCase | None:
    invoice_number = result.get("invoice_number")
    po_number = result.get("po_number")
    grn_number = result.get("grn_number")
    if not any((invoice_number, po_number, grn_number)):
        return None

    stmt = select(ReconciliationCase)
    if invoice_number:
        stmt = stmt.where(ReconciliationCase.invoice_number == invoice_number)
    if po_number:
        stmt = stmt.where(ReconciliationCase.po_number == po_number)
    if grn_number:
        stmt = stmt.where(ReconciliationCase.grn_number == grn_number)
    return db.scalars(stmt).first()


def save_reconciliation_result(db: Session, result: dict) -> ReconciliationCase:
    case = find_existing_reconciliation_case(db, result)
    if case is None:
        case = ReconciliationCase(case_number=build_next_case_number(db))
        db.add(case)

    case.invoice_number = result.get("invoice_number")
    case.po_number = result.get("po_number")
    case.grn_number = result.get("grn_number")
    case.partner_name = result.get("partner_name")
    case.partner_tax_id = result.get("partner_tax_id")
    case.case_date = date.today()
    case.total_amount = result.get("total_amount")
    case.status = result.get("status", "major_diff")
    case.risk_level = result.get("risk_level", "high")
    case.confidence = result.get("confidence")
    case.diff_amount = result.get("diff_amount")
    case.diff_type = result.get("diff_type")
    case.ai_note = result.get("ai_note")
    case.ai_summary = result.get("ai_summary")
    case.ai_recommendation = result.get("ai_recommendation")
    case.updated_at = datetime.now()

    case.line_items = [
        LineItem(
            row_index=line.get("row_index") or idx,
            item_sku=line.get("item_sku"),
            item_name=line.get("item_name"),
            unit=line.get("unit"),
            inv_qty=line.get("inv_qty"),
            po_qty=line.get("po_qty"),
            grn_qty=line.get("grn_qty"),
            inv_unit_price=line.get("inv_unit_price"),
            po_unit_price=line.get("po_unit_price"),
            vat_rate_pct=line.get("vat_rate_pct"),
            diff_type=line.get("diff_type"),
            diff_note=line.get("diff_note"),
        )
        for idx, line in enumerate(result.get("line_items", []), 1)
    ]
    db.flush()
    return case


def reconcile_ready_batch(db: Session, batch: DocumentBatch) -> ReconciliationCase | None:
    if batch.status != "ready":
        return None

    uploads_by_type = get_valid_uploads_by_type(db, batch)
    if any(not uploads_by_type.get(doc_type) for doc_type in REQUIRED_DOC_TYPES):
        return None

    po_data = aggregate_extracted_documents("po", uploads_by_type["po"])
    invoice_data = aggregate_extracted_documents("invoice", uploads_by_type["invoice"])
    grn_data = aggregate_extracted_documents("grn", uploads_by_type["grn"])
    result = reconcile_documents(invoice_data, po_data, grn_data, db)
    return save_reconciliation_result(db, result)


def get_valid_uploads_by_type(db: Session, batch: DocumentBatch) -> dict[str, list[UploadedFile]]:
    active_files = get_active_batch_files(batch, db=db)
    uploads_by_type: dict[str, list[UploadedFile]] = {doc_type: [] for doc_type in REQUIRED_DOC_TYPES}
    for upload in active_files:
        if (
            upload.doc_type in uploads_by_type
            and upload.ai_extraction
            and upload.ai_extraction.is_correct_type
            and upload.ai_extraction.extracted_data
        ):
            uploads_by_type[upload.doc_type].append(upload)
    return uploads_by_type


def get_latest_valid_uploads_by_type(db: Session, batch: DocumentBatch) -> dict[str, UploadedFile]:
    uploads_by_type = get_valid_uploads_by_type(db, batch)
    return {doc_type: uploads[-1] for doc_type, uploads in uploads_by_type.items() if uploads}


def find_batch_reconciliation_case(db: Session, batch: DocumentBatch) -> ReconciliationCase | None:
    uploads_by_type = get_valid_uploads_by_type(db, batch)
    if any(not uploads_by_type.get(doc_type) for doc_type in REQUIRED_DOC_TYPES):
        return None

    extracted_docs = {
        doc_type: aggregate_extracted_documents(doc_type, uploads_by_type[doc_type])
        for doc_type in REQUIRED_DOC_TYPES
    }
    return find_existing_reconciliation_case(
        db,
        {
            "invoice_number": extracted_docs["invoice"].get("invoice_number"),
            "po_number": extracted_docs["po"].get("po_number"),
            "grn_number": extracted_docs["grn"].get("grn_number"),
        },
    )


def build_reconciliation_not_matched_message(reconciliation_case: ReconciliationCase) -> str:
    detail = reconciliation_case.ai_summary or reconciliation_case.ai_note
    if not detail:
        diff_lines = [
            line.diff_note
            for line in reconciliation_case.line_items
            if line.diff_type and line.diff_type != "MATCH" and line.diff_note
        ]
        detail = "; ".join(diff_lines[:3])
    if detail:
        return f"Backend đang ghi nhận batch chưa khớp hoàn toàn: {detail}"
    return "Chỉ có thể duyệt batch đã khớp hoàn toàn."


def to_document_batch_out(batch: DocumentBatch, db: Session | None = None) -> DocumentBatchOut:
    active_files = get_active_batch_files(batch, db=db)
    files = [to_uploaded_file_out(upload) for upload in active_files]
    uploaded_doc_types = sorted({file.doc_type for file in files if file.doc_type})
    missing_doc_types = [doc_type for doc_type in REQUIRED_DOC_TYPES if doc_type not in uploaded_doc_types]
    extracted_doc_types = sorted(
        {
            file.doc_type
            for file in files
            if file.doc_type
            and (
                (file.ai_extraction and file.ai_extraction.is_correct_type and file.ai_extraction.extracted_data)
                or (not file.ai_extraction and file.status == "completed")
            )
        }
    )
    effective_status = batch.status
    pending_extraction_doc_types = [
        doc_type
        for doc_type in REQUIRED_DOC_TYPES
        if doc_type in uploaded_doc_types and any(f.doc_type == doc_type and f.status in ("processing", "queued") for f in files)
    ]

    history_list: list[DocumentBatchHistoryOut] = []
    histories = getattr(batch, "histories", []) or []
    for h in histories:
        h_files = [UploadedFileOut(**f) for f in (h.files_data or [])]
        history_list.append(
            DocumentBatchHistoryOut(
                id=h.id,
                batch_id=h.batch_id,
                version=h.version,
                status=h.status,
                rejection_note=h.rejection_note,
                rejected_by_name=h.rejected_by_name or (h.rejected_by.full_name if h.rejected_by else None),
                rejected_at=h.rejected_at.strftime("%Y-%m-%d %H:%M:%S") if h.rejected_at else None,
                files=h_files,
                note=h.note,
                created_at=h.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            )
        )
    history_list.sort(key=lambda item: item.version, reverse=True)

    return DocumentBatchOut(
        id=batch.id,
        batch_number=batch.batch_number,
        version=batch.version or 1,
        note=batch.note,
        rejection_note=batch.rejection_note,
        status=effective_status,
        created_by_id=batch.created_by_id,
        created_by_name=batch.created_by.full_name if batch.created_by else None,
        approved_by_id=batch.approved_by_id,
        approved_by_name=batch.approved_by.full_name if batch.approved_by else None,
        chief_approved_by_id=batch.chief_approved_by_id,
        chief_approved_by_name=batch.chief_approved_by.full_name if batch.chief_approved_by else None,
        files=files,
        history=history_list,
        missing_doc_types=missing_doc_types,
        uploaded_doc_types=uploaded_doc_types,
        extracted_doc_types=extracted_doc_types,
        pending_extraction_doc_types=pending_extraction_doc_types,
        created_at=batch.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        updated_at=batch.updated_at.strftime("%Y-%m-%d %H:%M:%S") if batch.updated_at else None,
    )


@router.post("/batches", response_model=DocumentBatchOut)
async def create_upload_batch(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchOut:
    batch = create_document_batch(db, current_user)
    db.commit()
    db.refresh(batch)
    return to_document_batch_out(batch, db)


@router.get("/batches", response_model=DocumentBatchListResponse)
async def list_upload_batches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchListResponse:
    stmt = (
        select(DocumentBatch)
        .options(
            selectinload(DocumentBatch.created_by),
            selectinload(DocumentBatch.approved_by),
            selectinload(DocumentBatch.chief_approved_by),
            selectinload(DocumentBatch.files).selectinload(UploadedFile.uploaded_by),
            selectinload(DocumentBatch.files).selectinload(UploadedFile.ai_extraction),
            selectinload(DocumentBatch.histories).selectinload(DocumentBatchHistory.rejected_by),
        )
        .order_by(DocumentBatch.updated_at.desc(), DocumentBatch.created_at.desc())
    )
    if current_user.role.code == "accountant":
        stmt = stmt.where(
            or_(
                DocumentBatch.created_by_id == current_user.public_id,
                DocumentBatch.approved_by_id == current_user.public_id,
                DocumentBatch.files.any(UploadedFile.uploaded_by_id == current_user.public_id),
            )
        )
    batches = db.scalars(stmt).all()
    items = [to_document_batch_out(batch, db) for batch in batches]
    return DocumentBatchListResponse(items=items, total=len(items))


@router.patch("/batches/{batch_id}", response_model=DocumentBatchOut)
async def update_upload_batch(
    batch_id: int,
    payload: DocumentBatchUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchOut:
    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")
    require_batch_access(current_user, batch)

    next_note = payload.note.strip() if payload.note else None
    batch.note = next_note or None
    batch.updated_at = datetime.now()
    db.add(batch)
    write_audit_log(
        db=db,
        action="DOCUMENT_BATCH_NOTE_UPDATED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch_id),
        details={
            "batch_number": batch.batch_number,
            "note": batch.note,
        },
        ip_address=None,
        user_agent=None,
    )
    db.commit()
    db.refresh(batch)
    return to_document_batch_out(batch, db)


@router.post("/batches/{batch_id}/approve", response_model=DocumentBatchOut)
async def approve_upload_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchOut:
    require_accountant(current_user)

    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")
    require_batch_access(current_user, batch)

    if batch.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Batch đã bị kế toán trưởng từ chối. Vui lòng upload bổ sung chứng từ trước khi duyệt lại.",
        )

    if batch.status == "approved":
        return to_document_batch_out(batch, db)

    update_batch_status(db, batch)
    db.flush()
    if batch.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chỉ có thể duyệt batch đã đủ chứng từ và trích xuất xong.",
        )

    reconciliation_case = reconcile_ready_batch(db, batch) or find_batch_reconciliation_case(db, batch)
    if reconciliation_case is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chưa tìm thấy kết quả đối soát của batch này.",
        )
    if reconciliation_case.status != "matched":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=build_reconciliation_not_matched_message(reconciliation_case),
        )

    batch.status = "approved"
    batch.approved_by_id = current_user.public_id
    batch.updated_at = datetime.now()
    db.add(batch)
    notifications = create_notifications_for_role(
        db,
        role_code="chief_accountant",
        actor=current_user,
        batch_id=batch.id,
        kind="batch_submitted",
        title="Batch mới chờ duyệt",
        message=f"{current_user.full_name} đã duyệt {batch.batch_number} và gửi sang Kế toán trưởng.",
        action_url=f"/audit-trail?status=unapproved&batchId={batch.id}",
    )
    write_audit_log(
        db=db,
        action="DOCUMENT_BATCH_APPROVED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch_id),
        details={
            "batch_number": batch.batch_number,
            "case_id": str(reconciliation_case.id),
            "case_number": reconciliation_case.case_number,
            "note": "Matched document batch approved by accountant.",
        },
        ip_address=None,
        user_agent=None,
    )
    db.commit()
    db.refresh(batch)
    await publish_notifications(db, notifications)
    return to_document_batch_out(batch, db)


@router.post("/batches/{batch_id}/final-approve", response_model=DocumentBatchOut)
async def final_approve_upload_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchOut:
    # Chỉ kế toán trưởng mới được duyệt final
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ kế toán trưởng mới có quyền duyệt cuối cùng."
        )

    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")

    if batch.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Batch đã bị từ chối. Vui lòng chờ kế toán viên upload bổ sung trước khi duyệt.",
        )

    # Batch phải ở trạng thái approved (đã qua kế toán viên duyệt)
    if batch.status not in ["approved", "final_approved"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chỉ có thể duyệt batch đã được kế toán viên duyệt."
        )

    # Nếu đã duyệt rồi thì trả về luôn
    if batch.status == "final_approved":
        return to_document_batch_out(batch, db)

    batch.status = "final_approved"
    batch.chief_approved_by_id = current_user.public_id
    batch.updated_at = datetime.now()
    db.add(batch)

    reconciliation_case = find_batch_reconciliation_case(db, batch)
    write_audit_log(
        db=db,
        action="DOCUMENT_BATCH_FINAL_APPROVED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch_id),
        details={
            "batch_number": batch.batch_number,
            "case_id": str(reconciliation_case.id) if reconciliation_case else None,
            "case_number": reconciliation_case.case_number if reconciliation_case else None,
            "note": "Document batch final approved by chief accountant.",
        },
        ip_address=None,
        user_agent=None,
    )
    db.commit()
    db.refresh(batch)
    return to_document_batch_out(batch, db)


@router.post("/batches/{batch_id}/reject", response_model=DocumentBatchOut)
async def reject_upload_batch(
    batch_id: int,
    payload: DocumentBatchRejectRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchOut:
    # Chỉ kế toán trưởng mới được từ chối
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ kế toán trưởng mới có quyền từ chối batch."
        )

    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")

    # Batch phải đã được kế toán viên duyệt trước
    if batch.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chỉ có thể từ chối batch đã được kế toán viên duyệt."
        )

    # Nếu đã từ chối rồi thì trả về luôn
    if batch.status == "rejected":
        return to_document_batch_out(batch, db)

    rejection_note = payload.rejection_note.strip()
    if not rejection_note:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Vui lòng nhập lý do từ chối batch.",
        )

    batch.status = "rejected"
    batch.chief_approved_by_id = current_user.public_id  # Lưu người từ chối
    batch.rejection_note = rejection_note
    batch.updated_at = datetime.now()
    snapshot_batch_history(db, batch, rejection_note=rejection_note, rejected_by=current_user)
    db.add(batch)
    db.flush()

    recipient = get_batch_rejection_recipient(db, batch)
    action_url = build_rejected_batch_url(request, batch.id)
    notifications = []
    if recipient:
        notifications.append(
            create_notification(
                db,
                recipient=recipient,
                actor=current_user,
                batch_id=batch.id,
                kind="batch_rejected",
                title="Batch đã bị từ chối",
                message=f"{current_user.full_name} đã từ chối {batch.batch_number}: {rejection_note}",
                action_url=f"/audit-trail?overviewFilter=rejected&batchId={batch.id}",
            )
        )
    email_status = "missing_recipient"
    if recipient and recipient.email:
        if is_smtp_configured():
            email_status = "queued"
            background_tasks.add_task(
                send_batch_rejected_email,
                to_email=recipient.email,
                recipient_name=recipient.full_name,
                batch_number=batch.batch_number,
                rejected_by=current_user.full_name,
                rejection_note=rejection_note,
                rejected_at=batch.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
                action_url=action_url,
            )
        else:
            email_status = "smtp_not_configured"
            logger.warning(
                "Không queue email từ chối batch %s tới %s vì SMTP chưa được cấu hình đầy đủ.",
                batch.batch_number,
                recipient.email,
            )
    elif recipient:
        email_status = "missing_recipient_email"

    reconciliation_case = find_batch_reconciliation_case(db, batch)
    write_audit_log(
        db=db,
        action="DOCUMENT_BATCH_REJECTED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch_id),
        details={
            "batch_number": batch.batch_number,
            "case_id": str(reconciliation_case.id) if reconciliation_case else None,
            "case_number": reconciliation_case.case_number if reconciliation_case else None,
            "note": rejection_note,
            "notification_email": recipient.email if recipient else None,
            "notification_queued": email_status == "queued",
            "notification_email_status": email_status,
            "notification_action_url": action_url if recipient else None,
        },
        ip_address=None,
        user_agent=None,
    )
    db.commit()
    db.refresh(batch)
    await publish_notifications(db, notifications)
    return to_document_batch_out(batch, db)


@router.delete("/batches/{batch_id}", response_model=MessageResponse)
async def delete_upload_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")
    require_batch_access(current_user, batch)

    has_uploaded_files = (
        db.query(UploadedFile.id)
        .filter(UploadedFile.batch_id == batch.id)
        .first()
        is not None
    )
    if has_uploaded_files:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chi co the xoa batch chua co chung tu nao.",
        )

    deleted_batch_number = batch.batch_number
    db.delete(batch)
    write_audit_log(
        db=db,
        action="DOCUMENT_BATCH_DELETED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch_id),
        details={
            "batch_number": deleted_batch_number,
            "note": "Empty document batch deleted.",
        },
        ip_address=None,
        user_agent=None,
    )
    db.commit()
    return MessageResponse(message="Da xoa batch chua co chung tu.")


@router.get("", response_model=UploadedFileListResponse)
async def list_uploads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadedFileListResponse:
    stmt = (
        select(UploadedFile)
        .options(
            selectinload(UploadedFile.uploaded_by),
            selectinload(UploadedFile.ai_extraction),
        )
        .order_by(UploadedFile.created_at.desc())
    )
    if current_user.role.code == "accountant":
        stmt = stmt.outerjoin(DocumentBatch, UploadedFile.batch_id == DocumentBatch.id).where(
            or_(
                UploadedFile.uploaded_by_id == current_user.public_id,
                DocumentBatch.created_by_id == current_user.public_id,
                DocumentBatch.approved_by_id == current_user.public_id,
            )
        )
    uploads = db.scalars(stmt).all()

    items = [to_uploaded_file_out(up) for up in uploads]
    return UploadedFileListResponse(items=items, total=len(items))


@router.get("/{upload_id}/file", response_model=None)
async def view_uploaded_file(
    upload_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    upload = db.get(UploadedFile, upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay file da tai len.")
    if upload.batch_id:
        batch = db.get(DocumentBatch, upload.batch_id)
        if batch is not None:
            require_batch_access(current_user, batch)

    settings = get_settings()
    if settings.storage_provider in {"r2", "s3"}:
        try:
            file_content, content_type = download_file_from_object_storage(upload.storage_key)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Khong tai duoc file tu cloud storage: {exc}",
            ) from exc

        stored_filename = Path(upload.storage_key).name
        media_type = guess_inline_content_type(stored_filename, content_type)
        return Response(
            content=file_content,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="{stored_filename}"'},
        )

    file_path = resolve_uploaded_file_path(upload.storage_key)
    media_type = guess_inline_content_type(file_path.name)
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{file_path.name}"'},
    )


@router.delete("/{upload_id}", response_model=MessageResponse)
async def delete_uploaded_file(
    upload_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    upload = db.get(UploadedFile, upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay file da tai len.")

    batch = db.get(DocumentBatch, upload.batch_id) if upload.batch_id else None
    if batch is not None:
        require_batch_access(current_user, batch)
    deleted_filename = Path(upload.storage_key).name
    try:
        delete_uploaded_file_from_storage(upload)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Khong xoa duoc file da tai len: {exc}",
        ) from exc

    db.delete(upload)
    db.flush()
    if batch is not None:
        update_batch_status(db, batch)

    write_audit_log(
        db=db,
        action="DOCUMENT_DELETED",
        user=current_user,
        target_type="UPLOAD",
        target_id=str(upload_id),
        details={
            "deleted_filename": deleted_filename,
            "batch_id": batch.id if batch else None,
            "batch_number": batch.batch_number if batch else None,
            "note": "Uploaded file deleted from storage and document batch.",
        },
        ip_address=None,
        user_agent=None,
    )
    db.commit()
    return MessageResponse(message="Đã xóa file đã tải lên.")


@router.post("", response_model=UploadedFileOut)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str | None = Form(None),
    batch_id: int | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadedFileOut:
    filename = file.filename or "unknown_file"
    try:
        requested_doc_type = normalize_upload_doc_type(doc_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    batch = get_or_create_document_batch(db, batch_id, current_user)
    require_batch_access(current_user, batch)
    is_supplemental_rejected_upload = batch.status == "rejected" or bool(batch.rejection_note)
    if is_supplemental_rejected_upload and batch.status == "rejected":
        snapshot_batch_history(db, batch, rejection_note=batch.rejection_note, rejected_by=None)
        batch.version = (batch.version or 1) + 1
        batch.status = "incomplete"
        batch.approved_by_id = None
        batch.chief_approved_by_id = None

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    content_hash = calculate_content_hash(content)
    duplicate_upload = find_duplicate_upload_by_content(batch, content_hash)
    if duplicate_upload is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=DUPLICATE_UPLOAD_MESSAGE,
        )

    try:
        ai_analysis = analyze_uploaded_document(content, filename, content_type, requested_doc_type)
    except UnreadableDocumentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if requested_doc_type == AUTO_DOC_TYPE:
        selected_doc_type = ai_analysis.detected_doc_type
        if selected_doc_type not in ALLOWED_DOC_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Chưa nhận diện được file chứng từ. Vui lòng kiểm tra lại và kéo thả đúng file PO/Invoice hoặc GRN.",
            )
        ai_analysis.expected_doc_type = selected_doc_type
        ai_analysis.is_correct_type = True
        if ai_analysis.status != "low_quality":
            ai_analysis.status = "validated"
        ai_analysis.validation_message = (
            ai_analysis.validation_message
            or "He thong da tu nhan dien va gan chung tu vao dung o."
        )
    else:
        selected_doc_type = requested_doc_type

    try:
        storage_key = save_uploaded_file(content, filename, selected_doc_type, content_type)
        invoice_archive_key = None
        if selected_doc_type == "invoice":
            invoice_archive_key = save_invoice_file_to_archive(content, filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Luu file chung tu that bai: {exc}",
        ) from exc

    db_upload = UploadedFile(
        batch_id=batch.id,
        uploaded_by_id=current_user.public_id if current_user else None,
        doc_type=selected_doc_type,
        storage_key=storage_key,
        version=batch.version or 1,
    )
    db.add(db_upload)
    db.flush()
    create_ai_extraction_record(db, db_upload, ai_analysis)
    db.flush()
    update_batch_status(db, batch)
    reconcile_ready_batch(db, batch)
    db.commit()
    db.refresh(db_upload)

    write_audit_log(
        db=db,
        action="DOCUMENT_UPLOADED",
        user=current_user,
        target_type="UPLOAD",
        target_id=str(db_upload.id),
        details={
            "uploaded_filename": filename,
            "doc_type": selected_doc_type,
            "batch_id": batch.id,
            "batch_number": batch.batch_number,
            "storage_key": db_upload.storage_key,
            "invoice_archive_key": invoice_archive_key,
            "storage_provider": get_settings().storage_provider,
            "supplemental_rejected_batch_upload": is_supplemental_rejected_upload,
            "note": "File uploaded and linked to a document batch.",
        },
        ip_address=None,
        user_agent=None,
    )

    db.refresh(db_upload)
    return to_uploaded_file_out(db_upload)

import mimetypes
import os
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.config import get_settings
from src.database import get_db
from src.models.reconciliation import (
    DocumentBatch,
    LineItem,
    ReconciliationCase,
    UploadedDocumentExtraction,
    UploadedFile,
)
from src.models.schemas import (
    DocumentBatchListResponse,
    DocumentBatchOut,
    MessageResponse,
    UploadedDocumentExtractionOut,
    UploadedFileListResponse,
    UploadedFileOut,
)
from src.models.user import User
from src.services.auth import write_audit_log
from src.services.document_ai_extractor import DocumentAiAnalysis, analyze_uploaded_document
from src.services.reconciliation_engine import reconcile_documents
from src.services.s3_service import (
    delete_file_from_object_storage,
    download_file_from_object_storage,
    list_object_storage_keys,
    upload_file_to_object_storage,
)

router = APIRouter(prefix="/uploads", tags=["Uploads & Ingestion"])
ALLOWED_DOC_TYPES = {"invoice", "po", "grn"}
REQUIRED_DOC_TYPES = ["po", "invoice", "grn"]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_STORAGE_ROOT = PROJECT_ROOT / "storage" / "upload"
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


def update_batch_status(db: Session, batch: DocumentBatch) -> None:
    uploads = (
        db.query(UploadedFile)
        .filter(UploadedFile.batch_id == batch.id, UploadedFile.doc_type.in_(REQUIRED_DOC_TYPES))
        .all()
    )
    extracted_doc_types = {
        upload.doc_type
        for upload in uploads
        if upload.doc_type
        and upload.ai_extraction
        and upload.ai_extraction.is_correct_type
        and upload.ai_extraction.extracted_data
    }
    batch.status = "ready" if all(doc_type in extracted_doc_types for doc_type in REQUIRED_DOC_TYPES) else "incomplete"
    batch.updated_at = datetime.now()
    db.add(batch)


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

    uploads = (
        db.query(UploadedFile)
        .filter(UploadedFile.batch_id == batch.id, UploadedFile.doc_type.in_(REQUIRED_DOC_TYPES))
        .order_by(UploadedFile.created_at.desc(), UploadedFile.id.desc())
        .all()
    )
    latest_by_type: dict[str, UploadedFile] = {}
    for upload in uploads:
        if upload.doc_type not in latest_by_type and upload.ai_extraction and upload.ai_extraction.extracted_data:
            latest_by_type[upload.doc_type] = upload

    if any(doc_type not in latest_by_type for doc_type in REQUIRED_DOC_TYPES):
        return None

    po_data = normalize_extracted_document("po", latest_by_type["po"].ai_extraction.extracted_data)
    invoice_data = normalize_extracted_document("invoice", latest_by_type["invoice"].ai_extraction.extracted_data)
    grn_data = normalize_extracted_document("grn", latest_by_type["grn"].ai_extraction.extracted_data)
    result = reconcile_documents(invoice_data, po_data, grn_data, db)
    return save_reconciliation_result(db, result)


def to_document_batch_out(batch: DocumentBatch) -> DocumentBatchOut:
    files = [to_uploaded_file_out(upload) for upload in batch.files]
    uploaded_doc_types = sorted({file.doc_type for file in files if file.doc_type})
    missing_doc_types = [doc_type for doc_type in REQUIRED_DOC_TYPES if doc_type not in uploaded_doc_types]
    extracted_doc_types = sorted(
        {
            file.doc_type
            for file in files
            if file.doc_type
            and file.ai_extraction
            and file.ai_extraction.is_correct_type
            and file.ai_extraction.extracted_data
        }
    )
    pending_extraction_doc_types = [
        doc_type for doc_type in REQUIRED_DOC_TYPES if doc_type in uploaded_doc_types and doc_type not in extracted_doc_types
    ]
    return DocumentBatchOut(
        id=batch.id,
        batch_number=batch.batch_number,
        status=batch.status,
        created_by_id=batch.created_by_id,
        created_by_name=batch.created_by.full_name if batch.created_by else None,
        files=files,
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
    return to_document_batch_out(batch)


@router.get("/batches", response_model=DocumentBatchListResponse)
async def list_upload_batches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentBatchListResponse:
    stmt = select(DocumentBatch).order_by(DocumentBatch.updated_at.desc(), DocumentBatch.created_at.desc())
    batches = db.scalars(stmt).all()
    items = [to_document_batch_out(batch) for batch in batches]
    return DocumentBatchListResponse(items=items, total=len(items))


@router.delete("/batches/{batch_id}", response_model=MessageResponse)
async def delete_upload_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    batch = db.get(DocumentBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay bo doi soat.")

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
    stmt = select(UploadedFile).order_by(UploadedFile.created_at.desc())
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
    selected_doc_type = normalize_selected_doc_type(doc_type)
    batch = get_or_create_document_batch(db, batch_id, current_user)

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"

    try:
        ai_analysis = analyze_uploaded_document(content, filename, content_type, selected_doc_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        storage_key = save_uploaded_file(content, filename, selected_doc_type, content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload file len cloud storage that bai: {exc}",
        ) from exc

    db_upload = UploadedFile(
        batch_id=batch.id,
        uploaded_by_id=current_user.public_id if current_user else None,
        doc_type=selected_doc_type,
        storage_key=storage_key,
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
            "storage_provider": get_settings().storage_provider,
            "note": "File uploaded and linked to a document batch.",
        },
        ip_address=None,
        user_agent=None,
    )

    db.refresh(db_upload)
    return to_uploaded_file_out(db_upload)

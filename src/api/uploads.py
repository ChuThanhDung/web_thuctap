import mimetypes
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import get_db
from src.models.reconciliation import UploadedFile
from src.models.schemas import UploadedFileListResponse, UploadedFileOut
from src.models.user import User
from src.services.auth import write_audit_log

router = APIRouter(prefix="/uploads", tags=["Uploads & Ingestion"])
ALLOWED_DOC_TYPES = {"invoice", "po", "grn"}
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_STORAGE_ROOT = PROJECT_ROOT / "storage" / "upload"


def normalize_selected_doc_type(doc_type: str | None) -> str:
    storage_doc_type = (doc_type or "invoice").lower().strip()
    if storage_doc_type not in ALLOWED_DOC_TYPES:
        raise ValueError("Loai tai lieu khong hop le. Vui long chon invoice, po hoac grn.")
    return storage_doc_type


def build_sequential_stored_filename(target_dir: Path, selected_doc_type: str, file_ext: str) -> str:
    date_part = datetime.now().strftime("%d_%m_%Y")
    filename_prefix = f"{selected_doc_type}_{date_part}_"
    next_index = 1

    if target_dir.exists():
        for path in target_dir.iterdir():
            if not path.is_file() or not path.name.startswith(filename_prefix):
                continue
            index_text = path.stem.removeprefix(filename_prefix)
            if index_text.isdigit():
                next_index = max(next_index, int(index_text) + 1)

    filename = f"{filename_prefix}{next_index}"
    if file_ext:
        filename = f"{filename}.{file_ext}"
    return filename


def save_uploaded_file_to_local_storage(content: bytes, filename: str, selected_doc_type: str) -> str:
    original_filename = os.path.basename(filename)
    file_ext = Path(original_filename).suffix.lower().lstrip(".")

    target_dir = UPLOAD_STORAGE_ROOT / selected_doc_type
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = build_sequential_stored_filename(target_dir, selected_doc_type, file_ext)
    target_path = target_dir / stored_filename
    target_path.write_bytes(content)

    return target_path.relative_to(PROJECT_ROOT).as_posix()


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


def to_uploaded_file_out(upload: UploadedFile) -> UploadedFileOut:
    storage_path = Path(upload.storage_key)
    stored_filename = storage_path.name
    file_ext = storage_path.suffix.lower().lstrip(".")
    return UploadedFileOut(
        id=str(upload.id),
        uploaded_by_id=str(upload.uploaded_by_id) if upload.uploaded_by_id else None,
        uploaded_by_name=upload.uploaded_by.full_name if upload.uploaded_by else None,
        filename=stored_filename,
        original_filename=None,
        stored_filename=stored_filename,
        storage_provider="local",
        storage_key=upload.storage_key,
        file_url=f"/api/v1/uploads/{upload.id}/file",
        content_type=None,
        file_ext=file_ext,
        size=format_file_size(upload.storage_key),
        status="completed",
        progress=100,
        error_message=None,
        case_id=None,
        created_at=upload.created_at,
    )


@router.get("", response_model=UploadedFileListResponse)
async def list_uploads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadedFileListResponse:
    stmt = select(UploadedFile).order_by(UploadedFile.created_at.desc())
    uploads = db.scalars(stmt).all()

    items = [to_uploaded_file_out(up) for up in uploads]
    return UploadedFileListResponse(items=items, total=len(items))


@router.get("/{upload_id}/file")
async def view_uploaded_file(
    upload_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    upload = db.get(UploadedFile, upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay file da tai len.")

    file_path = resolve_uploaded_file_path(upload.storage_key)
    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{file_path.name}"'},
    )


@router.post("", response_model=UploadedFileOut)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadedFileOut:
    filename = file.filename or "unknown_file"
    selected_doc_type = normalize_selected_doc_type(doc_type)

    content = await file.read()
    storage_key = save_uploaded_file_to_local_storage(content, filename, selected_doc_type)

    db_upload = UploadedFile(
        id=uuid.uuid4(),
        uploaded_by_id=current_user.id if current_user else None,
        storage_key=storage_key,
    )
    db.add(db_upload)
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
            "storage_key": db_upload.storage_key,
            "note": "File uploaded and stored locally. Only uploader, storage path, and creation time are stored.",
        },
        ip_address=None,
        user_agent=None,
    )

    db.refresh(db_upload)
    return to_uploaded_file_out(db_upload)

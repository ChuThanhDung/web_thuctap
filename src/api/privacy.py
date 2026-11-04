"""Pháp lý và quyền dữ liệu: thông tin pháp lý công khai, đồng ý điều khoản, tắt AI, xuất dữ liệu, xóa công ty."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.api.auth import get_current_user, require_chief_accountant, to_auth_user
from src.api.uploads import (
    INVOICE_ARCHIVE_ROOT,
    UPLOAD_STORAGE_ROOT,
    delete_uploaded_file_from_storage,
    read_existing_upload_content,
)
from src.config import get_settings
from src.database import get_db
from src.models.schemas import AuthUser, DeletionRequest, LegalInfo, PrivacySettings, PrivacySettingsUpdate
from src.models.user import User
from src.services.auth import verify_password, write_audit_log
from src.services.billing import chief_emails
from src.services.email import send_deletion_scheduled_email
from src.services.privacy import (
    TERMS_VERSION,
    build_export,
    cancel_deletion,
    new_export_filename,
    record_terms_acceptance,
    schedule_deletion,
)

router = APIRouter(tags=["privacy"])


def audit(db: Session, request: Request, action: str, user: User, details: dict | None = None) -> None:
    write_audit_log(
        db=db,
        action=action,
        user=user,
        target_type="ORGANIZATION",
        target_id=str(user.organization_id),
        details=details,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def to_settings(user: User) -> PrivacySettings:
    organization = user.organization
    return PrivacySettings(
        ai_enabled=organization.ai_enabled,
        deletion_requested_at=organization.deletion_requested_at,
        deletion_scheduled_for=organization.deletion_scheduled_for,
    )


@router.get("/legal", response_model=LegalInfo)
async def legal_info() -> LegalInfo:
    """Thông tin hiện trên trang Điều khoản và Chính sách bảo vệ dữ liệu (công khai)."""
    settings = get_settings()
    return LegalInfo(
        terms_version=TERMS_VERSION,
        operator_name=settings.legal_operator_name,
        contact_email=settings.legal_contact_email or settings.smtp_from or settings.smtp_user,
        server_location=settings.legal_server_location,
        # Dịch vụ đọc PDF/ảnh hiện dùng (document_ai_extractor). XML không gửi ra ngoài.
        ai_providers=["OpenAI (Hoa Kỳ)"],
    )


@router.post("/auth/terms/accept", response_model=AuthUser)
async def accept_terms(
    request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AuthUser:
    record_terms_acceptance(current_user)
    db.commit()
    write_audit_log(
        db=db,
        action="TERMS_ACCEPTED",
        user=current_user,
        details={"version": TERMS_VERSION},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return to_auth_user(current_user)


@router.get("/privacy/settings", response_model=PrivacySettings)
async def privacy_settings(current_user: User = Depends(get_current_user)) -> PrivacySettings:
    require_chief_accountant(current_user)
    return to_settings(current_user)


@router.patch("/privacy/settings", response_model=PrivacySettings)
async def update_privacy_settings(
    payload: PrivacySettingsUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PrivacySettings:
    require_chief_accountant(current_user)
    organization = current_user.organization
    if organization.ai_enabled != payload.ai_enabled:
        organization.ai_enabled = payload.ai_enabled
        db.commit()
        audit(db, request, "AI_PROCESSING_ENABLED" if payload.ai_enabled else "AI_PROCESSING_DISABLED", current_user)
    return to_settings(current_user)


@router.get("/privacy/export", response_model=None)
async def export_company_data(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Tải toàn bộ dữ liệu công ty (ZIP: file gốc, dữ liệu đọc được, bộ đối soát, người dùng, nhật ký)."""
    require_chief_accountant(current_user)
    organization = current_user.organization
    path = build_export(db, organization, read_existing_upload_content)
    background_tasks.add_task(path.unlink, missing_ok=True)
    audit(db, request, "DATA_EXPORTED", current_user, {"size_bytes": path.stat().st_size})
    return FileResponse(path, media_type="application/zip", filename=new_export_filename(organization))


@router.post("/privacy/deletion", response_model=PrivacySettings)
async def request_company_deletion(
    payload: DeletionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PrivacySettings:
    require_chief_accountant(current_user)
    organization = current_user.organization
    if organization.deletion_scheduled_for is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Công ty đã có yêu cầu xóa đang chờ.")
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu không đúng.")
    if payload.confirm_name.strip().casefold() != organization.name.strip().casefold():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên công ty nhập lại không khớp.")
    scheduled = schedule_deletion(organization, current_user)
    db.commit()
    audit(db, request, "ORGANIZATION_DELETION_REQUESTED", current_user, {"scheduled_for": scheduled.isoformat()})
    for email in chief_emails(db, organization.id):
        send_deletion_scheduled_email(email, organization.name, current_user.full_name, scheduled)
    return to_settings(current_user)


@router.delete("/privacy/deletion", response_model=PrivacySettings)
async def cancel_company_deletion(
    request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PrivacySettings:
    require_chief_accountant(current_user)
    organization = current_user.organization
    if organization.deletion_scheduled_for is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Công ty không có yêu cầu xóa nào.")
    cancel_deletion(organization)
    db.commit()
    audit(db, request, "ORGANIZATION_DELETION_CANCELLED", current_user)
    return to_settings(current_user)


def purge_storage_dirs(organization_id) -> list:
    """Thư mục cục bộ của công ty trong kho file (dùng cho scripts/process_company_deletions.py)."""
    return [UPLOAD_STORAGE_ROOT / str(organization_id), INVOICE_ARCHIVE_ROOT / str(organization_id)]


__all__ = ["router", "purge_storage_dirs", "delete_uploaded_file_from_storage"]

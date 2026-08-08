"""
src/api/audit_logs.py — Endpoints xem nhật ký thao tác
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import get_db
from src.models.audit_log import AuditLog
from src.models.schemas import AuditLogListResponse, AuditLogOut
from src.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    action: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogListResponse:
    """Lấy danh sách nhật ký thao tác — tất cả vai trò đều xem được."""

    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())

    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))

    # accountant chỉ xem log của chính mình
    if current_user.role.code == "accountant":
        stmt = stmt.where(AuditLog.user_id == current_user.id)

    # Đếm tổng
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    # Phân trang
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)
    logs = db.scalars(stmt).all()

    # Lấy user names
    user_ids = {log.user_id for log in logs if log.user_id}
    user_map: dict = {}
    if user_ids:
        users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        user_map = {u.id: u.full_name for u in users}

    items = [
        AuditLogOut(
            id=log.id,
            user_id=str(log.user_id) if log.user_id else None,
            user_name=user_map.get(log.user_id) if log.user_id else "Hệ thống",
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at,
            timestamp=log.created_at,
        )
        for log in logs
    ]

    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )

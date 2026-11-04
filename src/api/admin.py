"""Trang quản trị nền tảng: danh sách công ty khách hàng, gói, mức sử dụng; khóa/mở công ty, đổi gói.

Chỉ vai trò `platform_admin`. Admin chỉ thấy thông tin công ty, tài khoản và số đếm, không đọc chứng từ hay kết quả
đối soát của khách. Các truy vấn đếm chạy ở chế độ hệ thống (bỏ qua RLS) vì phải tổng hợp qua mọi công ty.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from src.api.auth import PLATFORM_ADMIN, get_current_user
from src.database import get_db, use_system_context
from src.models.organization import Organization
from src.models.reconciliation import DocumentBatch, UploadedFile
from src.models.role import Role
from src.models.schemas import (
    AdminOrganizationDetail,
    AdminOrganizationList,
    AdminOrganizationRow,
    AdminOrganizationUpdate,
    AdminOrganizationUser,
    AdminOverview,
)
from src.models.user import User
from src.services.auth import write_audit_log
from src.services.organizations import PLANS, effective_plan, is_in_trial

router = APIRouter(prefix="/admin", tags=["admin"])

# Ngày tạo bộ và file lưu theo giờ Việt Nam, không có múi giờ.
MONTH_START = text("date_trunc('month', timezone('Asia/Ho_Chi_Minh', now()))")


def require_platform_admin(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    if current_user.role.code != PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ quản trị nền tảng mới vào được trang này."
        )
    use_system_context(db)
    return current_user


def _counts_by_org(db: Session, stmt) -> dict[uuid.UUID, int]:
    return {org_id: count for org_id, count in db.execute(stmt).all()}


def _rows(db: Session, organizations: list[Organization]) -> list[AdminOrganizationRow]:
    ids = [organization.id for organization in organizations]
    if not ids:
        return []
    users = _counts_by_org(
        db,
        select(User.organization_id, func.count(User.id))
        .where(User.organization_id.in_(ids))
        .group_by(User.organization_id),
    )
    batches = _counts_by_org(
        db,
        select(DocumentBatch.organization_id, func.count(DocumentBatch.id))
        .where(DocumentBatch.organization_id.in_(ids))
        .group_by(DocumentBatch.organization_id),
    )
    batches_month = _counts_by_org(
        db,
        select(DocumentBatch.organization_id, func.count(DocumentBatch.id))
        .where(DocumentBatch.organization_id.in_(ids), DocumentBatch.created_at >= MONTH_START)
        .group_by(DocumentBatch.organization_id),
    )
    files_month = _counts_by_org(
        db,
        select(UploadedFile.organization_id, func.count(UploadedFile.id))
        .where(UploadedFile.organization_id.in_(ids), UploadedFile.created_at >= MONTH_START)
        .group_by(UploadedFile.organization_id),
    )
    last_activity = dict(
        db.execute(
            select(DocumentBatch.organization_id, func.max(DocumentBatch.created_at))
            .where(DocumentBatch.organization_id.in_(ids))
            .group_by(DocumentBatch.organization_id)
        ).all()
    )
    # Người liên hệ: kế toán trưởng tạo sớm nhất (thường là người đăng ký).
    owners: dict[uuid.UUID, str] = {}
    for org_id, email in db.execute(
        select(User.organization_id, User.email)
        .join(Role, Role.id == User.role_id)
        .where(User.organization_id.in_(ids), Role.code == "chief_accountant")
        .order_by(User.created_at)
    ).all():
        owners.setdefault(org_id, email)

    return [
        AdminOrganizationRow(
            id=str(organization.id),
            name=organization.name,
            tax_id=organization.tax_id,
            plan=organization.plan,
            effective_plan=effective_plan(organization),
            status=organization.status,
            trial_ends_at=organization.trial_ends_at,
            created_at=organization.created_at,
            user_count=users.get(organization.id, 0),
            batch_count=batches.get(organization.id, 0),
            batches_this_month=batches_month.get(organization.id, 0),
            files_this_month=files_month.get(organization.id, 0),
            last_activity_at=last_activity.get(organization.id),
            owner_email=owners.get(organization.id),
        )
        for organization in organizations
    ]


def _get_organization(db: Session, organization_id: uuid.UUID) -> Organization:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy công ty.")
    return organization


def _detail(db: Session, organization: Organization) -> AdminOrganizationDetail:
    row = _rows(db, [organization])[0]
    users = db.scalars(
        select(User)
        .options(selectinload(User.role))
        .where(User.organization_id == organization.id)
        .order_by(User.created_at)
    ).all()
    return AdminOrganizationDetail(
        **row.model_dump(),
        users=[
            AdminOrganizationUser(
                id=str(user.id),
                email=user.email,
                full_name=user.full_name,
                role=user.role.code,
                status=user.status,
                last_login_at=user.last_login_at,
            )
            for user in users
        ],
    )


@router.get("/overview", response_model=AdminOverview)
async def admin_overview(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)) -> AdminOverview:
    organizations = db.scalars(select(Organization)).all()
    now = datetime.now(UTC)
    by_plan = dict.fromkeys(PLANS, 0)
    for organization in organizations:
        by_plan[effective_plan(organization, now)] = by_plan.get(effective_plan(organization, now), 0) + 1
    return AdminOverview(
        organizations=len(organizations),
        active_organizations=sum(1 for o in organizations if o.status == "active"),
        suspended_organizations=sum(1 for o in organizations if o.status == "suspended"),
        in_trial=sum(1 for o in organizations if is_in_trial(o, now)),
        by_plan=by_plan,
        users=db.scalar(select(func.count(User.id)).where(User.organization_id.is_not(None))) or 0,
        signups_last_30_days=sum(1 for o in organizations if o.created_at and o.created_at >= now - timedelta(days=30)),
        batches_this_month=db.scalar(
            select(func.count(DocumentBatch.id)).where(DocumentBatch.created_at >= MONTH_START)
        )
        or 0,
        files_this_month=db.scalar(select(func.count(UploadedFile.id)).where(UploadedFile.created_at >= MONTH_START))
        or 0,
    )


@router.get("/organizations", response_model=AdminOrganizationList)
async def list_organizations(
    search: str | None = Query(default=None, max_length=100),
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> AdminOrganizationList:
    stmt = select(Organization).order_by(Organization.created_at.desc())
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        owner_match = select(User.organization_id).where(User.email.ilike(pattern))
        stmt = stmt.where(
            or_(Organization.name.ilike(pattern), Organization.tax_id.ilike(pattern), Organization.id.in_(owner_match))
        )
    organizations = db.scalars(stmt).all()
    rows = _rows(db, list(organizations))
    return AdminOrganizationList(items=rows, total=len(rows))


@router.get("/organizations/{organization_id}", response_model=AdminOrganizationDetail)
async def get_organization_detail(
    organization_id: uuid.UUID, _: User = Depends(require_platform_admin), db: Session = Depends(get_db)
) -> AdminOrganizationDetail:
    return _detail(db, _get_organization(db, organization_id))


@router.patch("/organizations/{organization_id}", response_model=AdminOrganizationDetail)
async def update_organization(
    organization_id: uuid.UUID,
    payload: AdminOrganizationUpdate,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> AdminOrganizationDetail:
    organization = _get_organization(db, organization_id)
    changes: dict[str, object] = {}
    if payload.plan is not None and payload.plan != organization.plan:
        changes["plan"] = [organization.plan, payload.plan]
        organization.plan = payload.plan
    if payload.status is not None and payload.status != organization.status:
        changes["status"] = [organization.status, payload.status]
        organization.status = payload.status
    if payload.trial_days is not None:
        new_end = datetime.now(UTC) + timedelta(days=payload.trial_days) if payload.trial_days else datetime.now(UTC)
        changes["trial_ends_at"] = [
            organization.trial_ends_at.isoformat() if organization.trial_ends_at else None,
            new_end.isoformat(),
        ]
        organization.trial_ends_at = new_end
    db.commit()
    db.refresh(organization)

    if changes:
        write_audit_log(
            db=db,
            action="ORGANIZATION_UPDATED",
            user=admin,
            target_type="ORGANIZATION",
            target_id=str(organization.id),
            details={"organization": organization.name, "changes": changes},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return _detail(db, organization)

"""
src/api/reconciliations.py — CRUD endpoints cho đối soát
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from src.api.auth import get_current_user
from src.database import get_db
from src.models.reconciliation import ReconciliationCase
from src.models.schemas import (
    CaseDecisionRequest,
    CaseDetailOut,
    DashboardStatsOut,
    LineItemOut,
    ReconciliationListItem,
    ReconciliationListResponse,
)
from src.models.user import User
from src.services.auth import write_audit_log

router = APIRouter(prefix="/reconciliations", tags=["reconciliations"])


def _require_chief(current_user: User) -> None:
    """Raise 403 nếu không phải chief_accountant."""
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán trưởng mới có quyền thực hiện hành động này.",
        )


def _case_to_list_item(c: ReconciliationCase) -> ReconciliationListItem:
    processed_by_name = c.processed_by.full_name if c.processed_by else None
    return ReconciliationListItem(
        id=str(c.id),
        case_number=c.case_number,
        invoice_number=c.invoice_number,
        po_number=c.po_number,
        grn_number=c.grn_number,
        partner_name=c.partner_name,
        case_date=c.case_date,
        total_amount=c.total_amount,
        status=c.status,
        risk_level=c.risk_level,
        confidence=c.confidence,
        diff_amount=c.diff_amount,
        diff_type=c.diff_type,
        ai_note=c.ai_note,
        decision=c.decision,
        processed_by_name=processed_by_name,
        processed_at=c.processed_at,
    )


def _case_to_detail(c: ReconciliationCase) -> CaseDetailOut:
    processed_by_name = c.processed_by.full_name if c.processed_by else None
    line_items = [
        LineItemOut(
            id=str(li.id),
            row_index=li.row_index,
            item_sku=li.item_sku,
            item_name=li.item_name,
            unit=li.unit,
            inv_qty=li.inv_qty,
            po_qty=li.po_qty,
            grn_qty=li.grn_qty,
            inv_unit_price=li.inv_unit_price,
            po_unit_price=li.po_unit_price,
            vat_rate_pct=li.vat_rate_pct,
            diff_type=li.diff_type,
            diff_note=li.diff_note,
        )
        for li in c.line_items
    ]
    return CaseDetailOut(
        id=str(c.id),
        case_number=c.case_number,
        invoice_number=c.invoice_number,
        po_number=c.po_number,
        grn_number=c.grn_number,
        partner_name=c.partner_name,
        partner_tax_id=c.partner_tax_id,
        case_date=c.case_date,
        total_amount=c.total_amount,
        status=c.status,
        risk_level=c.risk_level,
        confidence=c.confidence,
        diff_amount=c.diff_amount,
        diff_type=c.diff_type,
        ai_note=c.ai_note,
        ai_summary=c.ai_summary,
        ai_recommendation=c.ai_recommendation,
        decision=c.decision,
        rejection_note=c.rejection_note,
        processed_by_name=processed_by_name,
        processed_at=c.processed_at,
        line_items=line_items,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET /reconciliations — Danh sách (phân trang + filter)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("", response_model=ReconciliationListResponse)
async def list_reconciliations(
    status_filter: str | None = Query(default=None, alias="status"),
    risk_level: str | None = Query(default=None),
    partner: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReconciliationListResponse:
    """Lấy danh sách hồ sơ đối soát, hỗ trợ filter và phân trang."""
    stmt = (
        select(ReconciliationCase)
        .options(selectinload(ReconciliationCase.processed_by))
        .options(selectinload(ReconciliationCase.line_items))
        .order_by(ReconciliationCase.case_date.desc(), ReconciliationCase.case_number)
    )

    if status_filter:
        stmt = stmt.where(ReconciliationCase.status == status_filter)
    if risk_level:
        stmt = stmt.where(ReconciliationCase.risk_level == risk_level)
    if partner:
        stmt = stmt.where(ReconciliationCase.partner_name.ilike(f"%{partner}%"))

    # Đếm tổng
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    # Phân trang
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)
    cases = db.scalars(stmt).all()

    return ReconciliationListResponse(
        items=[_case_to_list_item(c) for c in cases],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET /reconciliations/stats — Dashboard statistics (chief_accountant only)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/stats", response_model=DashboardStatsOut)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardStatsOut:
    """Thống kê tổng quan cho Dashboard — chỉ Kế toán trưởng."""
    _require_chief(current_user)

    all_cases = db.scalars(select(ReconciliationCase)).all()

    total_cases = len(all_cases)
    total_matched = sum(1 for c in all_cases if c.status == "matched")
    total_pending = sum(1 for c in all_cases if c.decision is None and c.status != "matched")
    total_escalated = sum(1 for c in all_cases if c.decision == "escalated" or c.status in ("major_diff", "low_confidence"))
    total_value = sum(c.total_amount or 0 for c in all_cases)
    pending_value = sum(c.total_amount or 0 for c in all_cases if c.decision is None)

    match_rate = round(total_matched / total_cases * 100, 1) if total_cases > 0 else 0.0

    by_status: dict[str, int] = {}
    by_risk: dict[str, int] = {}
    for c in all_cases:
        by_status[c.status] = by_status.get(c.status, 0) + 1
        by_risk[c.risk_level] = by_risk.get(c.risk_level, 0) + 1

    return DashboardStatsOut(
        total_cases=total_cases,
        total_matched=total_matched,
        total_pending=total_pending,
        total_escalated=total_escalated,
        total_value=total_value,
        pending_value=pending_value,
        match_rate=match_rate,
        cases_by_status=by_status,
        cases_by_risk=by_risk,
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET /reconciliations/{case_id} — Chi tiết một case
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/{case_id}", response_model=CaseDetailOut)
async def get_reconciliation_detail(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CaseDetailOut:
    """Chi tiết hồ sơ đối soát kèm line items."""
    stmt = (
        select(ReconciliationCase)
        .options(selectinload(ReconciliationCase.processed_by))
        .options(selectinload(ReconciliationCase.line_items))
        .where(ReconciliationCase.case_number == case_id)
    )
    case = db.scalars(stmt).first()

    # Thử tìm theo UUID nếu không khớp case_number
    if case is None:
        try:
            import uuid
            uid = uuid.UUID(case_id)
            stmt2 = (
                select(ReconciliationCase)
                .options(selectinload(ReconciliationCase.processed_by))
                .options(selectinload(ReconciliationCase.line_items))
                .where(ReconciliationCase.id == uid)
            )
            case = db.scalars(stmt2).first()
        except ValueError:
            pass

    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ đối soát.")

    return _case_to_detail(case)


# ──────────────────────────────────────────────────────────────────────────────
# POST /reconciliations/{case_id}/decide — Phê duyệt / Từ chối / Escalate
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/{case_id}/decide", response_model=CaseDetailOut)
async def decide_case(
    case_id: str,
    payload: CaseDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CaseDetailOut:
    """Phê duyệt / từ chối / escalate hồ sơ — chỉ Kế toán trưởng."""
    _require_chief(current_user)

    stmt = (
        select(ReconciliationCase)
        .options(selectinload(ReconciliationCase.processed_by))
        .options(selectinload(ReconciliationCase.line_items))
        .where(ReconciliationCase.case_number == case_id)
    )
    case = db.scalars(stmt).first()

    # Thử tìm theo UUID nếu không khớp case_number
    if case is None:
        try:
            import uuid
            uid = uuid.UUID(case_id)
            stmt_uuid = (
                select(ReconciliationCase)
                .options(selectinload(ReconciliationCase.processed_by))
                .options(selectinload(ReconciliationCase.line_items))
                .where(ReconciliationCase.id == uid)
            )
            case = db.scalars(stmt_uuid).first()
        except ValueError:
            pass

    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ đối soát.")

    case.decision = payload.decision
    case.rejection_note = payload.note if payload.decision == "rejected" else None
    case.processed_by_id = current_user.id
    case.processed_at = datetime.now(UTC)

    db.commit()
    db.refresh(case)

    # Ghi audit log
    write_audit_log(
        db=db,
        action=f"CASE_{payload.decision.upper()}",
        user=current_user,
        target_type="RECONCILIATION_CASE",
        target_id=str(case.id),
        details={
            "case_number": case.case_number,
            "decision": payload.decision,
            "note": payload.note,
        },
        ip_address=None,
        user_agent=None,
    )

    # Reload với relationships
    stmt2 = (
        select(ReconciliationCase)
        .options(selectinload(ReconciliationCase.processed_by))
        .options(selectinload(ReconciliationCase.line_items))
        .where(ReconciliationCase.id == case.id)
    )
    case = db.scalars(stmt2).first()
    return _case_to_detail(case)

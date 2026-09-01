"""
src/api/thresholds.py — Endpoints quản lý ngưỡng sai số
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import get_db
from src.models.reconciliation import Threshold
from src.models.schemas import ThresholdCreateRequest, ThresholdOut, ThresholdUpdateRequest
from src.models.user import User
from src.services.auth import write_audit_log

router = APIRouter(prefix="/thresholds", tags=["thresholds"])


def to_threshold_out(threshold: Threshold) -> ThresholdOut:
    return ThresholdOut(
        id=str(threshold.id),
        category=threshold.category,
        percent_threshold=threshold.percent_threshold,
        absolute_threshold=threshold.absolute_threshold,
        updated_at=threshold.updated_at,
        created_at=threshold.created_at,
    )


def _require_chief(current_user: User) -> None:
    if current_user.role.code != "chief_accountant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán trưởng mới có quyền thay đổi ngưỡng.",
        )


@router.get("", response_model=list[ThresholdOut])
async def list_thresholds(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ThresholdOut]:
    """Lấy tất cả ngưỡng sai số — tất cả vai trò đều xem được."""
    thresholds = db.scalars(select(Threshold).order_by(Threshold.category)).all()
    return [to_threshold_out(t) for t in thresholds]


@router.post("", response_model=ThresholdOut, status_code=status.HTTP_201_CREATED)
async def create_threshold(
    payload: ThresholdCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ThresholdOut:
    _require_chief(current_user)

    category = payload.category.strip()
    existing = db.scalars(select(Threshold).where(Threshold.category == category)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên quy tắc đã tồn tại.")

    threshold = Threshold(
        category=category,
        percent_threshold=payload.percent_threshold,
        absolute_threshold=payload.absolute_threshold,
        updated_by_id=current_user.id,
    )
    db.add(threshold)
    db.commit()
    db.refresh(threshold)

    write_audit_log(
        db=db,
        action="THRESHOLD_CREATED",
        user=current_user,
        details={
            "category": threshold.category,
            "percent_threshold": str(threshold.percent_threshold),
            "absolute_threshold": str(threshold.absolute_threshold),
        },
        ip_address=None,
        user_agent=None,
    )

    return to_threshold_out(threshold)


@router.put("/{threshold_id}", response_model=ThresholdOut)
async def update_threshold(
    threshold_id: str,
    payload: ThresholdUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ThresholdOut:
    """Cập nhật ngưỡng sai số — chỉ Kế toán trưởng."""
    _require_chief(current_user)

    try:
        import uuid

        uid = uuid.UUID(threshold_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="threshold_id không hợp lệ.")

    threshold = db.scalars(select(Threshold).where(Threshold.id == uid)).first()
    if threshold is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ngưỡng cấu hình.")

    old_values = {
        "category": threshold.category,
        "percent_threshold": str(threshold.percent_threshold),
        "absolute_threshold": str(threshold.absolute_threshold),
    }

    if payload.category is not None:
        category = payload.category.strip()
        duplicate = db.scalars(select(Threshold).where(Threshold.category == category, Threshold.id != uid)).first()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên quy tắc đã tồn tại.")
        threshold.category = category
    threshold.percent_threshold = payload.percent_threshold
    threshold.absolute_threshold = payload.absolute_threshold
    threshold.updated_by_id = current_user.id
    db.commit()
    db.refresh(threshold)

    write_audit_log(
        db=db,
        action="THRESHOLD_UPDATED",
        user=current_user,
        details={
            "category": threshold.category,
            "old": old_values,
            "new": {
                "percent_threshold": str(payload.percent_threshold),
                "absolute_threshold": str(payload.absolute_threshold),
                "category": threshold.category,
            },
        },
        ip_address=None,
        user_agent=None,
    )

    return to_threshold_out(threshold)


@router.delete("/{threshold_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_threshold(
    threshold_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _require_chief(current_user)

    try:
        import uuid

        uid = uuid.UUID(threshold_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="threshold_id không hợp lệ.")

    threshold = db.scalars(select(Threshold).where(Threshold.id == uid)).first()
    if threshold is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ngưỡng cấu hình.")

    category = threshold.category
    db.delete(threshold)
    db.commit()

    write_audit_log(
        db=db,
        action="THRESHOLD_DELETED",
        user=current_user,
        details={"category": category},
        ip_address=None,
        user_agent=None,
    )

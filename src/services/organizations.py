"""Thao tác trên công ty khách hàng dùng chung cho seed, đăng ký và trang quản trị nền tảng."""

import uuid

from sqlalchemy.orm import Session

from src.models.reconciliation import Threshold

# Ngưỡng mặc định của mỗi công ty mới (đúng quy tắc trong PRODUCT.md): số tiền lệch tối đa 1.000 đ do làm tròn,
# số lượng phải khớp tuyệt đối. Công ty tự chỉnh ở trang Ngưỡng sai số.
DEFAULT_THRESHOLDS = (
    {"category": "Đơn giá & Tổng tiền", "percent_threshold": "0", "absolute_threshold": "1000"},
    {"category": "Số lượng", "percent_threshold": "0", "absolute_threshold": "0"},
)


def ensure_default_thresholds(db: Session, organization_id: uuid.UUID) -> None:
    """Tạo bộ ngưỡng mặc định cho công ty nếu còn thiếu loại nào. Không commit."""
    existing = {
        category
        for (category,) in db.query(Threshold.category).filter(Threshold.organization_id == organization_id).all()
    }
    for data in DEFAULT_THRESHOLDS:
        if data["category"] not in existing:
            db.add(Threshold(organization_id=organization_id, **data))

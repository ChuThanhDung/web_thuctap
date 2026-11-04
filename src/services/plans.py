"""Hạn mức của từng gói và mức dùng của công ty.

Kiểm tra trước khi làm việc tốn tài nguyên (tạo bộ, đọc file bằng AI, thêm người, lưu file), đếm sau khi làm xong.
Vượt hạn mức trả lỗi 402 kèm lời nhắc nâng cấp. Kiểm tra trước rồi mới đếm nên vài file tải song song có thể vượt hạn
mức một chút: chấp nhận được, đổi lại không phải khóa cả công ty trong lúc chờ AI.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from src.models.billing import UsageCounter
from src.models.organization import Organization
from src.models.reconciliation import UploadedFile
from src.models.signup import UserInvitation
from src.models.user import User
from src.services.organizations import PLAN_NAMES, effective_plan

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
MB = 1024 * 1024


@dataclass(frozen=True)
class PlanLimits:
    # None = không giới hạn.
    users: int | None
    batches_per_month: int
    ai_files_per_month: int
    agent_calls_per_month: int
    storage_bytes: int
    retention_months: int
    monthly_price: int
    support: str


PLAN_LIMITS: dict[str, PlanLimits] = {
    "free": PlanLimits(
        users=2,
        batches_per_month=15,
        ai_files_per_month=10,
        agent_calls_per_month=20,
        storage_bytes=200 * MB,
        retention_months=6,
        monthly_price=0,
        support="Tài liệu hướng dẫn",
    ),
    "pro": PlanLimits(
        users=10,
        batches_per_month=300,
        ai_files_per_month=600,
        agent_calls_per_month=500,
        storage_bytes=10 * 1024 * MB,
        retention_months=60,
        monthly_price=490_000,
        support="Email, phản hồi trong 1 ngày làm việc",
    ),
    "ultra": PlanLimits(
        users=None,
        batches_per_month=2_000,
        ai_files_per_month=5_000,
        agent_calls_per_month=3_000,
        storage_bytes=50 * 1024 * MB,
        retention_months=120,
        monthly_price=1_490_000,
        support="Email/Zalo ưu tiên",
    ),
}

# Trả trước 12 tháng chỉ tính tiền 10 tháng.
BILLING_PERIODS = {1: 1, 12: 10}


def price_for(plan: str, months: int) -> int:
    return PLAN_LIMITS[plan].monthly_price * BILLING_PERIODS[months]


class PlanLimitError(Exception):
    """Vượt hạn mức của gói. API trả 402 với thông báo này."""

    def __init__(self, message: str, *, resource: str):
        super().__init__(message)
        self.resource = resource


def current_period(now: datetime | None = None) -> str:
    return (now.astimezone(VN_TZ) if now else datetime.now(VN_TZ)).strftime("%Y-%m")


def limits_for(organization: Organization) -> tuple[str, PlanLimits]:
    plan = effective_plan(organization)
    return plan, PLAN_LIMITS[plan]


def _counter(db: Session, organization_id: uuid.UUID, period: str | None = None) -> UsageCounter | None:
    return db.get(UsageCounter, (organization_id, period or current_period()))


def record_usage(
    db: Session, organization_id: uuid.UUID, *, batches: int = 0, ai_files: int = 0, agent_calls: int = 0
) -> None:
    """Cộng mức dùng tháng này (upsert một câu lệnh, an toàn khi nhiều request cùng lúc). Không commit."""
    db.execute(
        text(
            """
            INSERT INTO usage_counters (organization_id, period, batches_created, ai_files, agent_calls, updated_at)
            VALUES (:org, :period, :batches, :ai_files, :agent_calls, now())
            ON CONFLICT (organization_id, period) DO UPDATE SET
                batches_created = usage_counters.batches_created + EXCLUDED.batches_created,
                ai_files = usage_counters.ai_files + EXCLUDED.ai_files,
                agent_calls = usage_counters.agent_calls + EXCLUDED.agent_calls,
                updated_at = now()
            """
        ),
        {
            "org": organization_id,
            "period": current_period(),
            "batches": batches,
            "ai_files": ai_files,
            "agent_calls": agent_calls,
        },
    )


def seat_count(db: Session, organization_id: uuid.UUID) -> int:
    """Số chỗ đang dùng: tài khoản đang hoạt động và lời mời còn hiệu lực."""
    users = (
        db.scalar(
            select(func.count(User.id)).where(
                User.organization_id == organization_id, func.upper(User.status) == "ACTIVE"
            )
        )
        or 0
    )
    invitations = (
        db.scalar(
            select(func.count(UserInvitation.id)).where(
                UserInvitation.organization_id == organization_id,
                UserInvitation.accepted_at.is_(None),
                UserInvitation.revoked_at.is_(None),
                UserInvitation.expires_at > func.now(),
            )
        )
        or 0
    )
    return users + invitations


def storage_used(db: Session, organization_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.coalesce(func.sum(UploadedFile.file_size_bytes), 0)).where(
                UploadedFile.organization_id == organization_id
            )
        )
        or 0
    )


def usage_summary(db: Session, organization: Organization) -> dict:
    counter = _counter(db, organization.id)
    return {
        "period": current_period(),
        "users": seat_count(db, organization.id),
        "batches": counter.batches_created if counter else 0,
        "ai_files": counter.ai_files if counter else 0,
        "agent_calls": counter.agent_calls if counter else 0,
        "storage_bytes": storage_used(db, organization.id),
    }


def _upgrade_hint(plan: str) -> str:
    return "Nâng cấp gói ở trang Gói & thanh toán." if plan != "ultra" else "Liên hệ để được tăng hạn mức."


def ensure_can_create_batch(db: Session, organization: Organization) -> None:
    plan, limits = limits_for(organization)
    counter = _counter(db, organization.id)
    if (counter.batches_created if counter else 0) >= limits.batches_per_month:
        raise PlanLimitError(
            f"Đã dùng hết {limits.batches_per_month} bộ đối soát của gói {PLAN_NAMES[plan]} tháng này. "
            + _upgrade_hint(plan),
            resource="batches",
        )


def ensure_can_upload(db: Session, organization: Organization, *, size_bytes: int, uses_ai: bool) -> None:
    plan, limits = limits_for(organization)
    if storage_used(db, organization.id) + size_bytes > limits.storage_bytes:
        raise PlanLimitError(
            f"Đã hết dung lượng lưu trữ {limits.storage_bytes // MB:,} MB của gói {PLAN_NAMES[plan]}. ".replace(
                ",", "."
            )
            + _upgrade_hint(plan),
            resource="storage",
        )
    if uses_ai:
        counter = _counter(db, organization.id)
        if (counter.ai_files if counter else 0) >= limits.ai_files_per_month:
            raise PlanLimitError(
                f"Đã dùng hết {limits.ai_files_per_month} lượt AI đọc PDF/ảnh của gói {PLAN_NAMES[plan]} tháng này. "
                "File XML vẫn tải được bình thường. " + _upgrade_hint(plan),
                resource="ai_files",
            )


def ensure_can_add_user(db: Session, organization: Organization) -> None:
    plan, limits = limits_for(organization)
    if limits.users is not None and seat_count(db, organization.id) >= limits.users:
        raise PlanLimitError(
            f"Gói {PLAN_NAMES[plan]} có tối đa {limits.users} người dùng (tính cả lời mời đang chờ). "
            + _upgrade_hint(plan),
            resource="users",
        )


AI_DISABLED_MESSAGE = (
    "Công ty đã tắt AI nên trợ lý không hoạt động. Kế toán trưởng bật lại ở trang Dữ liệu & quyền riêng tư."
)


class AgentUnavailableError(Exception):
    """Công ty tắt AI: trợ lý không được gửi dữ liệu ra ngoài."""


def ensure_can_use_agent(db: Session, organization: Organization) -> None:
    if not organization.ai_enabled:
        raise AgentUnavailableError(AI_DISABLED_MESSAGE)
    plan, limits = limits_for(organization)
    counter = _counter(db, organization.id)
    if (counter.agent_calls if counter else 0) >= limits.agent_calls_per_month:
        raise PlanLimitError(
            f"Đã dùng hết {limits.agent_calls_per_month} lượt trợ lý AI của gói {PLAN_NAMES[plan]} tháng này. "
            + _upgrade_hint(plan),
            resource="agent_calls",
        )

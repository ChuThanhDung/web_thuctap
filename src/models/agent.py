import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.organization import organization_fk


class AgentRun(Base):
    """Một lần trợ lý AI chạy: xếp bộ, điều tra, soạn thư hay trả lời câu hỏi. Ghi lại để xem lại, đếm chi phí."""

    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[uuid.UUID] = organization_fk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(postgresql.UUID(as_uuid=True), nullable=True)
    # sort | investigate | supplier_email | chat
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    # ok | error | ai_unavailable
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ok")
    input_summary: Mapped[dict | None] = mapped_column(postgresql.JSONB, nullable=True)
    output: Mapped[dict | None] = mapped_column(postgresql.JSONB, nullable=True)
    llm_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

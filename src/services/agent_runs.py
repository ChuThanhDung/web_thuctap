"""Khung chung cho mỗi lần trợ lý AI chạy: kiểm tra quyền dùng AI và hạn mức, ghi agent_runs, đếm lượt, ghi nhật ký."""

from contextlib import contextmanager

from sqlalchemy.orm import Session

from src.models.agent import AgentRun
from src.models.user import User
from src.services.agent_llm import AgentMeter, agent_model
from src.services.auth import write_audit_log
from src.services.plans import ensure_can_use_agent, record_usage

AUDIT_ACTIONS = {
    "sort": "AGENT_SORT",
    "investigate": "AGENT_INVESTIGATE",
    "supplier_email": "AGENT_EMAIL_DRAFT",
    "chat": "AGENT_CHAT",
}


class AgentRunContext:
    def __init__(self, kind: str, input_summary: dict):
        self.kind = kind
        self.input_summary = input_summary
        self.meter = AgentMeter()
        self.output: dict | None = None
        self.status = "ok"
        self.run_id: int | None = None


@contextmanager
def agent_run(db: Session, user: User, kind: str, input_summary: dict, *, check_quota: bool = True):
    """Bọc một lần chạy. Kiểm tra trước (AI bật, còn lượt), ghi lại sau, kể cả khi lỗi.

    Lượt tính theo số lần gọi mô hình thật (meter.calls): phần trợ lý tự quyết bằng quy tắc không tốn lượt.
    """
    if check_quota:
        ensure_can_use_agent(db, user.organization)
    context = AgentRunContext(kind, input_summary)
    try:
        yield context
    except Exception:
        # Bỏ thay đổi dở dang của lần chạy lỗi, nhưng vẫn ghi lại lần chạy (và lượt AI đã tốn) bên dưới.
        db.rollback()
        if context.status == "ok":
            context.status = "error"
        raise
    finally:
        run = AgentRun(
            user_id=user.id,
            kind=kind,
            status=context.status,
            input_summary=input_summary,
            output=context.output,
            llm_calls=context.meter.calls,
            prompt_tokens=context.meter.prompt_tokens,
            completion_tokens=context.meter.completion_tokens,
            model=context.meter.model or (agent_model() if context.meter.calls else None),
        )
        db.add(run)
        if context.meter.calls:
            record_usage(db, user.organization_id, agent_calls=context.meter.calls)
        db.flush()
        context.run_id = run.id
        write_audit_log(
            db=db,
            action=AUDIT_ACTIONS.get(kind, "AGENT_RUN"),
            user=user,
            target_type="AGENT_RUN",
            target_id=str(run.id),
            details={
                "kind": kind,
                "status": context.status,
                "llm_calls": context.meter.calls,
                "tokens": context.meter.prompt_tokens + context.meter.completion_tokens,
                **{key: value for key, value in input_summary.items() if key in ("batch_id", "batch_number", "files")},
            },
            ip_address=None,
            user_agent=None,
        )

"""Trợ lý AI: xếp chứng từ vào bộ, điều tra khi lệch, soạn thư cho nhà cung cấp, hỏi đáp trên dữ liệu.

Trợ lý chỉ đề xuất; mọi thay đổi (tạo bộ, đổi chỗ liên, gửi thư) cần người dùng bấm xác nhận ở một endpoint riêng.
Mọi truy vấn chạy trên session RLS của người gọi nên chỉ thấy dữ liệu công ty mình.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.api.uploads import require_batch_access
from src.database import get_db
from src.models.audit_log import AuditLog
from src.models.reconciliation import DocumentBatch
from src.models.user import User
from src.services import agent_chat, agent_email, agent_investigate, agent_sort
from src.services.agent_llm import AgentAIUnavailableError, is_available
from src.services.agent_runs import agent_run
from src.services.auth import write_audit_log
from src.services.email import is_smtp_configured, send_supplier_letter
from src.services.plans import (
    AgentUnavailableError,
    PlanLimitError,
    ensure_can_use_agent,
    limits_for,
    usage_summary,
)

router = APIRouter(prefix="/agent", tags=["agent"])

BUSINESS_ROLES = ("accountant", "chief_accountant")


def require_business_user(current_user: User) -> None:
    if current_user.role.code not in BUSINESS_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trợ lý chỉ dành cho kế toán của công ty.")


def agent_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, AgentUnavailableError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, AgentAIUnavailableError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    raise exc


@router.get("/status")
async def agent_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Trợ lý có dùng được không, và còn bao nhiêu lượt tháng này."""
    require_business_user(current_user)
    organization = current_user.organization
    _plan, limits = limits_for(organization)
    return {
        "ai_enabled": organization.ai_enabled,
        "model_available": is_available(),
        "used": usage_summary(db, organization)["agent_calls"],
        "limit": limits.agent_calls_per_month,
    }


# ---------------------------------------------------------------------------
# Bước 1. Tự xếp chứng từ vào bộ
# ---------------------------------------------------------------------------


class SortApplyGroup(BaseModel):
    po: int | None = None
    invoice: int | None = None
    grn: int | None = None


class SortApplyRequest(BaseModel):
    groups: list[SortApplyGroup] = Field(..., min_length=1, max_length=50)


@router.get("/inbox")
async def get_sort_inbox(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Hộp chờ xếp của người dùng (tạo nếu chưa có). Frontend tải file vào batch_id này như tải bình thường."""
    require_business_user(current_user)
    inbox = agent_sort.get_inbox(db, current_user, create=True)
    db.commit()
    return {
        "batch_id": inbox.id,
        "files": [agent_sort.describe_file(upload) for upload in agent_sort.inbox_files(db, inbox)],
    }


@router.post("/sort")
async def propose_sort(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Đề xuất cách xếp các file trong hộp chờ thành bộ. Không thay đổi dữ liệu."""
    require_business_user(current_user)
    inbox = agent_sort.get_inbox(db, current_user, create=False)
    uploads = agent_sort.inbox_files(db, inbox) if inbox else []
    if not uploads:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hộp chờ xếp chưa có file nào.")
    organization = current_user.organization
    # Quy tắc tự quyết phần lớn trường hợp; chỉ gọi AI khi có file mơ hồ và công ty còn lượt.
    may_use_ai = organization.ai_enabled
    if may_use_ai:
        try:
            ensure_can_use_agent(db, organization)
        except PlanLimitError:
            may_use_ai = False
    with agent_run(db, current_user, "sort", {"files": len(uploads)}, check_quota=False) as run:
        proposal = agent_sort.propose(db, uploads, run.meter, may_use_ai=may_use_ai)
        run.output = proposal
    db.commit()
    return {
        **proposal,
        "files": {upload.id: agent_sort.describe_file(upload) for upload in uploads},
        "run_id": run.run_id,
    }


@router.post("/sort/apply")
async def apply_sort(
    payload: SortApplyRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """Tạo bộ theo các nhóm người dùng đã xác nhận (có thể đã sửa). Mỗi bộ tính một lượt hạn mức bộ."""
    require_business_user(current_user)
    inbox = agent_sort.get_inbox(db, current_user, create=False)
    if inbox is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hộp chờ xếp chưa có file nào.")
    batches = agent_sort.apply_groups(db, current_user, inbox, [group.model_dump() for group in payload.groups])
    db.commit()
    write_audit_log(
        db=db,
        action="AGENT_SORT_APPLIED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=",".join(str(batch.id) for batch in batches),
        details={"batches": [batch.batch_number for batch in batches]},
        ip_address=None,
        user_agent=None,
    )
    return {
        "batches": [{"id": batch.id, "batch_number": batch.batch_number, "status": batch.status} for batch in batches]
    }


# ---------------------------------------------------------------------------
# Bước 2. Điều tra khi lệch
# ---------------------------------------------------------------------------


def load_batch(db: Session, current_user: User, batch_id: int) -> DocumentBatch:
    batch = db.get(DocumentBatch, batch_id)
    if batch is None or batch.is_inbox:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy bộ đối soát.")
    require_batch_access(current_user, batch)
    return batch


class SwapRequest(BaseModel):
    doc_type: str
    incoming_upload_id: int


@router.post("/batches/{batch_id}/investigate")
async def investigate_batch(
    batch_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """Tìm nguyên nhân bộ lệch và đề xuất cách sửa. Không thay đổi dữ liệu."""
    require_business_user(current_user)
    batch = load_batch(db, current_user, batch_id)
    organization = current_user.organization
    may_use_ai = organization.ai_enabled
    if may_use_ai:
        try:
            ensure_can_use_agent(db, organization)
        except PlanLimitError:
            may_use_ai = False
    with agent_run(
        db, current_user, "investigate", {"batch_id": batch.id, "batch_number": batch.batch_number}, check_quota=False
    ) as run:
        findings = agent_investigate.investigate(db, current_user, batch)
        summary, ai_used = agent_investigate.summarize(findings, run.meter, may_use_ai=may_use_ai)
        run.output = {**findings, "summary": summary}
    db.commit()
    return {**findings, "summary": summary, "ai_used": ai_used, "run_id": run.run_id}


@router.post("/batches/{batch_id}/swap")
async def swap_copy(
    batch_id: int,
    payload: SwapRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Người dùng đồng ý đề xuất: đưa liên đúng vào bộ, liên lạc loài về chỗ của liên kia. Đối soát lại các bộ."""
    require_business_user(current_user)
    batch = load_batch(db, current_user, batch_id)
    result = agent_investigate.apply_swap(db, current_user, batch, payload.doc_type, payload.incoming_upload_id)
    db.commit()
    write_audit_log(
        db=db,
        action="AGENT_COPY_SWAPPED",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch.id),
        details={"doc_type": payload.doc_type, "incoming_upload_id": payload.incoming_upload_id, **result},
        ip_address=None,
        user_agent=None,
    )
    return result


# ---------------------------------------------------------------------------
# Bước 3. Soạn thư gửi nhà cung cấp
# ---------------------------------------------------------------------------


class SupplierEmailSendRequest(BaseModel):
    to: EmailStr
    subject: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=20, max_length=8000)


def _case_with_differences(db: Session, batch: DocumentBatch):
    case = agent_email.find_case(db, batch)
    if case is None or case.status not in ("minor_diff", "major_diff"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Bộ này chưa có chênh lệch để gửi nhà cung cấp.")
    return case


def last_supplier_address(db: Session, tax_id: str) -> str | None:
    """Email đã dùng lần trước cho nhà cung cấp này (theo MST), để điền sẵn."""
    if not tax_id:
        return None
    entry = db.scalar(
        select(AuditLog)
        .where(AuditLog.action == "AGENT_EMAIL_SENT", AuditLog.details["tax_id"].astext == tax_id)
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    return (entry.details or {}).get("to") if entry else None


@router.post("/batches/{batch_id}/supplier-email")
async def draft_supplier_email(
    batch_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """Bản nháp thư cho nhà cung cấp. Không gửi gì."""
    require_business_user(current_user)
    batch = load_batch(db, current_user, batch_id)
    case = _case_with_differences(db, batch)
    facts = agent_email.collect_facts(case)
    organization = current_user.organization
    may_use_ai = organization.ai_enabled
    if may_use_ai:
        try:
            ensure_can_use_agent(db, organization)
        except PlanLimitError:
            may_use_ai = False
    with agent_run(
        db,
        current_user,
        "supplier_email",
        {"batch_id": batch.id, "batch_number": batch.batch_number},
        check_quota=False,
    ) as run:
        letter, ai_used = agent_email.draft_letter(
            facts, current_user, organization.name, run.meter, may_use_ai=may_use_ai
        )
        run.output = {"subject": letter["subject"], "lines": len(facts["lines"])}
    db.commit()
    return {
        **letter,
        "to": last_supplier_address(db, facts["tax_id"]),
        "supplier": facts["supplier"],
        "ai_used": ai_used,
        "can_send": is_smtp_configured(),
    }


@router.post("/batches/{batch_id}/supplier-email/send")
async def send_supplier_email(
    batch_id: int,
    payload: SupplierEmailSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Gửi thư người dùng đã đọc và sửa. Nhà cung cấp trả lời thẳng về email người gửi."""
    require_business_user(current_user)
    batch = load_batch(db, current_user, batch_id)
    case = _case_with_differences(db, batch)
    if not is_smtp_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Máy chủ chưa cấu hình email; hãy sao chép thư và tự gửi."
        )
    sent = send_supplier_letter(
        str(payload.to),
        payload.subject.strip(),
        payload.body.strip(),
        sender=current_user.email,
        organization_name=current_user.organization.name,
    )
    if not sent:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không gửi được thư, thử lại sau hoặc sao chép để tự gửi.")
    write_audit_log(
        db=db,
        action="AGENT_EMAIL_SENT",
        user=current_user,
        target_type="DOCUMENT_BATCH",
        target_id=str(batch.id),
        details={
            "batch_number": batch.batch_number,
            "to": str(payload.to),
            "tax_id": case.partner_tax_id or "",
            "subject": payload.subject.strip(),
        },
        ip_address=None,
        user_agent=None,
    )
    return {"sent": True}


# ---------------------------------------------------------------------------
# Bước 4. Hỏi đáp trên dữ liệu
# ---------------------------------------------------------------------------

MAX_CHAT_MESSAGES = 6


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)


@router.post("/chat")
async def chat(
    payload: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """Trả lời câu hỏi về dữ liệu công ty bằng các công cụ chỉ đọc. Chỉ gửi vài tin gần nhất để tiết kiệm."""
    require_business_user(current_user)
    messages = [message.model_dump() for message in payload.messages[-MAX_CHAT_MESSAGES:]]
    if messages[-1]["role"] != "user":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tin cuối phải là câu hỏi của bạn.")
    try:
        with agent_run(db, current_user, "chat", {"question": messages[-1]["content"][:300]}) as run:
            if not is_available():
                run.status = "ai_unavailable"
                raise AgentAIUnavailableError("Trợ lý hỏi đáp cần AI; máy chủ chưa cấu hình.")
            result = agent_chat.answer(db, current_user, messages, run.meter)
            run.output = {"answer": result["answer"][:2000], "tools": run.meter.steps}
    except (AgentUnavailableError, AgentAIUnavailableError) as exc:
        db.commit()
        raise agent_http_error(exc) from exc
    db.commit()
    return result

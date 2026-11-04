"""Trợ lý điều tra một bộ lệch: liên nào lạc loài, liên đúng đang nằm ở đâu, nên đổi chỗ với bộ nào.

Phần tìm kiếm dùng cùng cách chấm điểm với trợ lý xếp bộ (batch_sorter.score_pair), nên hai tính năng nói cùng một
ngôn ngữ. AI chỉ viết lời kết luận ngắn từ những gì quy tắc đã tìm ra; không có AI thì dùng câu mẫu.
"""

import json
import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models.reconciliation import DocumentBatch, UploadedFile
from src.models.user import User
from src.services.agent_llm import AgentAIUnavailableError, AgentMeter, complete_json, is_available
from src.services.agent_sort import describe_file, get_inbox, to_sort_file
from src.services.batch_sorter import DOC_LABELS, DOC_TYPES, INCOMPATIBLE, LINK_THRESHOLD, SortFile, score_pair

logger = logging.getLogger(__name__)

# Bộ còn sửa được: chưa duyệt, chưa bị trả lại. Bộ bị trả lại sửa bằng cách tải bổ sung (có lưu phiên bản).
MOVABLE_STATUSES = ("incomplete", "ready")
MAX_CANDIDATE_BATCHES = 200


def active_copies(db: Session, batch: DocumentBatch) -> dict[str, list[UploadedFile]]:
    from src.api.uploads import get_valid_uploads_by_type

    return get_valid_uploads_by_type(db, batch)


def _single(uploads: list[UploadedFile]) -> UploadedFile | None:
    return uploads[0] if len(uploads) == 1 else None


def fit(candidate: SortFile, partners: list[SortFile]) -> tuple[int, list[str]]:
    """Điểm trung bình của candidate với các liên còn lại; xung đột (khác MST…) thì là INCOMPATIBLE."""
    if not partners:
        return INCOMPATIBLE, []
    scores = [score_pair(candidate, partner) for partner in partners]
    if any(scored.score <= INCOMPATIBLE // 2 for scored in scores):
        return INCOMPATIBLE, [reason for scored in scores for reason in scored.reasons]
    reasons: list[str] = []
    for scored in scores:
        for reason in scored.reasons:
            if reason not in reasons:
                reasons.append(reason)
    return round(sum(scored.score for scored in scores) / len(scores)), reasons


def find_odd_copy(copies: dict[str, SortFile]) -> tuple[str, int, int] | None:
    """Liên lạc loài: hai liên kia khớp nhau (≥ ngưỡng) mà liên này không khớp với chúng. Trả (loại, điểm lạc, điểm cặp)."""
    if len(copies) < 3:
        return None
    best: tuple[str, int, int] | None = None
    for doc_type in DOC_TYPES:
        others = [copies[t] for t in DOC_TYPES if t != doc_type]
        pair_score = score_pair(others[0], others[1]).score
        own_fit, _ = fit(copies[doc_type], others)
        if pair_score >= LINK_THRESHOLD and own_fit < LINK_THRESHOLD and (best is None or own_fit < best[1]):
            best = (doc_type, own_fit, pair_score)
    return best


def _candidate_batches(db: Session, user: User, exclude_id: int) -> list[DocumentBatch]:
    from src.api.uploads import can_access_batch

    batches = db.scalars(
        select(DocumentBatch)
        .options(selectinload(DocumentBatch.files).selectinload(UploadedFile.ai_extraction))
        .where(
            DocumentBatch.id != exclude_id,
            DocumentBatch.is_inbox.is_(False),
            DocumentBatch.status.in_(MOVABLE_STATUSES),
        )
        .order_by(DocumentBatch.updated_at.desc())
        .limit(MAX_CANDIDATE_BATCHES)
    ).all()
    return [batch for batch in batches if can_access_batch(user, batch)]


def investigate(db: Session, user: User, batch: DocumentBatch) -> dict:
    """Kết quả điều tra (chưa có lời AI): liên lạc loài và các đề xuất đổi chỗ, xếp theo độ tin cậy."""
    uploads = active_copies(db, batch)
    copies: dict[str, SortFile] = {}
    upload_by_type: dict[str, UploadedFile] = {}
    for doc_type in DOC_TYPES:
        upload = _single(uploads.get(doc_type) or [])
        sort_file = to_sort_file(upload) if upload else None
        if sort_file:
            copies[doc_type] = sort_file
            upload_by_type[doc_type] = upload

    findings: dict = {
        "batch_id": batch.id,
        "batch_number": batch.batch_number,
        "odd_copy": None,
        "proposals": [],
        "missing": [DOC_LABELS[t] for t in DOC_TYPES if not uploads.get(t)],
        "multi_file": [DOC_LABELS[t] for t in DOC_TYPES if len(uploads.get(t) or []) > 1],
    }
    odd = find_odd_copy(copies)
    if odd is None:
        return findings

    odd_type, _odd_score, _pair_score = odd
    odd_file = copies[odd_type]
    partners = [copies[t] for t in DOC_TYPES if t != odd_type]
    findings["odd_copy"] = {
        "doc_type": odd_type,
        "label": DOC_LABELS[odd_type],
        "file": describe_file(upload_by_type[odd_type]),
    }

    proposals: list[dict] = []
    # Ứng viên: liên cùng loại ở bộ khác chưa duyệt, hoặc file chưa xếp trong hộp chờ của người dùng.
    sources: list[tuple[DocumentBatch, UploadedFile]] = []
    for other in _candidate_batches(db, user, batch.id):
        candidate = _single(active_copies(db, other).get(odd_type) or [])
        if candidate is not None:
            sources.append((other, candidate))
    inbox = get_inbox(db, user, create=False)
    if inbox is not None:
        for upload in inbox.files:
            if upload.doc_type == odd_type:
                sources.append((inbox, upload))

    for source_batch, candidate_upload in sources:
        candidate = to_sort_file(candidate_upload)
        if candidate is None:
            continue
        incoming_fit, incoming_reasons = fit(candidate, partners)
        if incoming_fit < LINK_THRESHOLD:
            continue
        # Liên lạc loài có hợp với bộ nguồn không? Có thì đây là hai bộ bị tráo liên cho nhau.
        outgoing_fit, outgoing_reasons = INCOMPATIBLE, []
        if not source_batch.is_inbox:
            source_partners = [
                to_sort_file(u)
                for t in DOC_TYPES
                if t != odd_type and (u := _single(active_copies(db, source_batch).get(t) or []))
            ]
            outgoing_fit, outgoing_reasons = fit(odd_file, [p for p in source_partners if p])
        swapped = outgoing_fit >= LINK_THRESHOLD
        proposals.append(
            {
                "kind": "swap" if swapped else ("from_inbox" if source_batch.is_inbox else "replace"),
                "doc_type": odd_type,
                "label": DOC_LABELS[odd_type],
                "source_batch": None
                if source_batch.is_inbox
                else {"id": source_batch.id, "batch_number": source_batch.batch_number},
                "incoming": describe_file(candidate_upload),
                "incoming_reasons": incoming_reasons,
                "outgoing_reasons": outgoing_reasons if swapped else [],
                "score": incoming_fit + (outgoing_fit if swapped else 0),
            }
        )
    proposals.sort(key=lambda item: item["score"], reverse=True)
    findings["proposals"] = proposals[:3]
    return findings


def template_summary(findings: dict) -> dict:
    """Kết luận viết sẵn khi không dùng AI."""
    odd = findings.get("odd_copy")
    if not odd:
        if findings.get("missing"):
            return {
                "conclusion": f"Bộ còn thiếu liên {', '.join(findings['missing'])}.",
                "next_step": "Tải bổ sung chứng từ còn thiếu.",
            }
        return {
            "conclusion": "Ba liên thuộc cùng một giao dịch; chênh lệch (nếu có) là chênh lệch thật giữa các chứng từ.",
            "next_step": "Xem bảng đối chiếu và soạn thư đề nghị nhà cung cấp điều chỉnh nếu cần.",
        }
    label = odd["label"]
    supplier = odd["file"].get("supplier_name") or "nhà cung cấp khác"
    proposals = findings.get("proposals") or []
    if not proposals:
        return {
            "conclusion": f"Liên {label} có vẻ thuộc giao dịch khác ({supplier}). Không tìm thấy liên {label} phù hợp ở các bộ chưa duyệt.",
            "next_step": f"Tải lại liên {label} đúng của giao dịch này.",
        }
    best = proposals[0]
    where = best["source_batch"]["batch_number"] if best["source_batch"] else "hộp chờ xếp"
    if best["kind"] == "swap":
        return {
            "conclusion": f"Liên {label} của bộ này và của {where} bị tráo cho nhau.",
            "next_step": f"Đổi chỗ hai liên {label}; cả hai bộ sẽ được đối soát lại.",
        }
    return {
        "conclusion": f"Liên {label} có vẻ thuộc giao dịch khác ({supplier}); liên {label} phù hợp đang nằm ở {where}.",
        "next_step": f"Chuyển liên {label} đó vào bộ này; liên hiện tại về hộp chờ xếp.",
    }


SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["conclusion", "next_step"],
    "properties": {"conclusion": {"type": "string"}, "next_step": {"type": "string"}},
}
SUMMARY_SYSTEM = (
    "Bạn là kế toán trưởng Việt Nam. Hệ thống đã kiểm tra một bộ chứng từ (PO, Hóa đơn, Phiếu nhập kho) và đưa ra "
    "'ket_luan_he_thong' cùng 'viec_can_lam_he_thong'. Viết lại hai ý đó rõ ràng, cụ thể hơn cho kế toán: "
    "'conclusion' (1-2 câu: liên nào thuộc giao dịch khác, của nhà cung cấp nào, số chứng từ nào) và 'next_step' "
    "(1 câu). GIỮ NGUYÊN Ý của hệ thống, không thêm kết luận khác. Không nêu số tiền. Không dùng markdown."
)


def summarize(findings: dict, meter: AgentMeter, *, may_use_ai: bool) -> tuple[dict, bool]:
    """Lời kết luận: AI viết nếu được phép và có gì để nói, không thì câu mẫu. Trả (kết luận, có dùng AI)."""
    fallback = template_summary(findings)
    if not (may_use_ai and is_available() and findings.get("odd_copy")):
        return fallback, False
    compact = {
        "ket_luan_he_thong": fallback["conclusion"],
        "viec_can_lam_he_thong": fallback["next_step"],
        "bo": findings["batch_number"],
        "lien_lac_loai": findings["odd_copy"],
        "de_xuat": [
            {
                k: v
                for k, v in proposal.items()
                if k in ("kind", "label", "source_batch", "incoming", "incoming_reasons")
            }
            for proposal in findings["proposals"]
        ],
    }
    try:
        answer = complete_json(
            SUMMARY_SYSTEM, json.dumps(compact, ensure_ascii=False, default=str), SUMMARY_SCHEMA, meter, name="ket_luan"
        )
    except AgentAIUnavailableError:
        return fallback, False
    return {
        "conclusion": str(answer.get("conclusion") or fallback["conclusion"])[:600],
        "next_step": str(answer.get("next_step") or fallback["next_step"])[:300],
    }, True


def apply_swap(db: Session, user: User, batch: DocumentBatch, doc_type: str, incoming_upload_id: int) -> dict:
    """Đưa file incoming vào bộ; liên đang ở bộ chuyển sang chỗ của incoming (bộ kia hoặc hộp chờ)."""
    from src.api.uploads import (
        LOCKED_BATCH_STATUSES,
        reconcile_ready_batch,
        require_batch_access,
        update_batch_status,
    )

    if doc_type not in DOC_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Loại chứng từ không hợp lệ.")
    incoming = db.get(UploadedFile, incoming_upload_id)
    if incoming is None or incoming.doc_type != doc_type or incoming.batch_id == batch.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tìm thấy liên để đổi.")
    source = db.get(DocumentBatch, incoming.batch_id)
    if source is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tìm thấy liên để đổi.")
    require_batch_access(user, source)
    for item in (batch, source):
        if item.status in LOCKED_BATCH_STATUSES:
            raise HTTPException(status.HTTP_409_CONFLICT, "Bộ đã duyệt là hồ sơ lưu trữ, không đổi liên được.")
        if not item.is_inbox and item.status not in MOVABLE_STATUSES:
            raise HTTPException(status.HTTP_409_CONFLICT, "Bộ bị trả lại: hãy tải bổ sung chứng từ để giữ lịch sử.")
    outgoing_list = active_copies(db, batch).get(doc_type) or []
    outgoing = _single(outgoing_list)
    if len(outgoing_list) > 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bộ có nhiều file cùng loại; hãy đổi thủ công.")
    if not source.is_inbox and len(active_copies(db, source).get(doc_type) or []) > 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bộ kia có nhiều file cùng loại; hãy đổi thủ công.")

    def move(upload: UploadedFile, target: DocumentBatch) -> None:
        upload.batch_id = target.id
        upload.version = target.version or 1
        if upload.ai_extraction is not None:
            upload.ai_extraction.batch_id = target.id

    move(incoming, batch)
    if outgoing is not None:
        move(outgoing, source)
    db.flush()
    for item in (batch, source):
        db.expire(item)
        if not item.is_inbox:
            update_batch_status(db, item)
            reconcile_ready_batch(db, item)
    return {
        "batch": {"id": batch.id, "batch_number": batch.batch_number},
        "other": None if source.is_inbox else {"id": source.id, "batch_number": source.batch_number},
        "moved_out_to_inbox": source.is_inbox and outgoing is not None,
    }

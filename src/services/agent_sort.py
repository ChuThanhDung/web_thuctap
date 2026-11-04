"""Trợ lý xếp bộ: đọc dữ liệu đã trích xuất của các file trong bộ tạm, đề xuất các bộ, và tạo bộ khi người dùng đồng ý."""

import json
import logging
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models.reconciliation import DocumentBatch, UploadedFile
from src.models.user import User
from src.services.agent_llm import AgentAIUnavailableError, AgentMeter, complete_json, is_available
from src.services.batch_sorter import (
    DOC_LABELS,
    DOC_TYPES,
    SortFile,
    SortGroup,
    SortResult,
    sort_files,
    summarize_file,
)

logger = logging.getLogger(__name__)

INBOX_PREFIX = "HOP_THU_"


def inbox_number(user: User) -> str:
    return f"{INBOX_PREFIX}{user.public_id}"


def get_inbox(db: Session, user: User, *, create: bool) -> DocumentBatch | None:
    batch = db.scalar(
        select(DocumentBatch)
        .options(selectinload(DocumentBatch.files).selectinload(UploadedFile.ai_extraction))
        .where(DocumentBatch.is_inbox.is_(True), DocumentBatch.created_by_id == user.public_id)
    )
    if batch is None and create:
        batch = DocumentBatch(
            batch_number=inbox_number(user), created_by_id=user.public_id, status="incomplete", is_inbox=True
        )
        db.add(batch)
        db.flush()
    return batch


def inbox_files(db: Session, batch: DocumentBatch) -> list[UploadedFile]:
    return list(
        db.scalars(
            select(UploadedFile)
            .options(selectinload(UploadedFile.ai_extraction))
            .where(UploadedFile.batch_id == batch.id)
            .order_by(UploadedFile.id)
        ).all()
    )


def to_sort_file(upload: UploadedFile) -> SortFile | None:
    from src.api.uploads import normalize_extracted_document

    extraction = upload.ai_extraction
    if not upload.doc_type or not extraction or not extraction.extracted_data:
        return None
    data = normalize_extracted_document(upload.doc_type, extraction.extracted_data)
    data["document_date"] = (extraction.extracted_data or {}).get("document_date")
    return SortFile(upload.id, upload.doc_type, data, Path(upload.storage_key).name)


def describe_file(upload: UploadedFile) -> dict:
    sort_file = to_sort_file(upload)
    data = sort_file.data if sort_file else {}
    return {
        "id": upload.id,
        "filename": Path(upload.storage_key).name,
        "doc_type": upload.doc_type,
        "doc_label": DOC_LABELS.get(upload.doc_type or "", "Chưa rõ"),
        "document_number": data.get(f"{upload.doc_type}_number") or data.get("document_number"),
        "supplier_name": data.get("supplier_name"),
        "supplier_tax_id": data.get("supplier_tax_id"),
        "total_amount": data.get("total_amount"),
        "item_count": len(data.get("line_items") or []),
        "readable": sort_file is not None,
    }


TIEBREAK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["decisions"],
    "properties": {
        "decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["file_id", "group", "reason"],
                "properties": {
                    "file_id": {"type": "integer"},
                    "group": {"type": "integer", "description": "Số thứ tự nhóm được chọn, -1 nếu không nhóm nào"},
                    "reason": {"type": "string"},
                },
            },
        }
    },
}

TIEBREAK_SYSTEM = (
    "Bạn là kế toán viên Việt Nam đang ghép chứng từ mua hàng thành bộ PO + Hóa đơn + Phiếu nhập kho của cùng một "
    "giao dịch. Với mỗi file mơ hồ, chọn đúng một nhóm trong các nhóm được đưa ra (hoặc -1 nếu không nhóm nào hợp). "
    "Dựa vào số PO ghi trên chứng từ, nhà cung cấp, mặt hàng và số lượng, ngày. Lý do viết tiếng Việt, tối đa 20 từ."
)


def resolve_ambiguous(result: SortResult, files: dict[int, SortFile], meter: AgentMeter) -> dict[int, str]:
    """Hỏi AI một lần cho mọi file mơ hồ. Trả về {file_id: lý do} của các file AI đã quyết. Sửa result tại chỗ."""
    if not result.ambiguous:
        return {}
    # Nhóm gốc chỉ có một file (vd. PO chưa ghép được gì) vẫn là một lựa chọn khi phân xử.
    for item in result.ambiguous:
        for anchor in item["anchors"]:
            if anchor in files and not any(anchor in group.files.values() for group in result.groups):
                result.groups.append(SortGroup(files={files[anchor].doc_type: anchor}, reasons=[], score=0))
                if anchor in result.unsorted:
                    result.unsorted.remove(anchor)
    payload = []
    for item in result.ambiguous:
        upload_id = item["upload_id"]
        options = []
        for index, group in enumerate(result.groups):
            if not set(item["anchors"]) & set(group.files.values()):
                continue
            members = [summarize_file(files[member]) for member in group.files.values() if member != upload_id]
            if members:
                options.append({"group": index, "chung_tu_trong_nhom": members})
        if len(options) >= 2:
            payload.append({"file": summarize_file(files[upload_id]), "cac_nhom": options[:4]})
    if not payload:
        return {}
    answer = complete_json(
        TIEBREAK_SYSTEM, json.dumps(payload, ensure_ascii=False, default=str), TIEBREAK_SCHEMA, meter, name="ghep_bo"
    )
    decided: dict[int, str] = {}
    for decision in answer.get("decisions") or []:
        upload_id, target = decision.get("file_id"), decision.get("group")
        if upload_id not in files or not isinstance(target, int):
            continue
        current = next((g for g in result.groups if upload_id in g.files.values()), None)
        doc_type = files[upload_id].doc_type
        if target == -1 and current is not None:
            del current.files[doc_type]
            result.unsorted.append(upload_id)
        elif 0 <= target < len(result.groups) and current is not None and result.groups[target] is not current:
            destination = result.groups[target]
            displaced = destination.files.get(doc_type)
            destination.files[doc_type] = upload_id
            if displaced is not None:
                current.files[doc_type] = displaced
            else:
                del current.files[doc_type]
        decided[upload_id] = str(decision.get("reason") or "")[:200]
    for group in result.groups:
        if len(group.files) < 2:
            result.unsorted.extend(group.files.values())
    result.groups = [group for group in result.groups if len(group.files) >= 2]
    return decided


def propose(db: Session, uploads: list[UploadedFile], meter: AgentMeter, *, may_use_ai: bool) -> dict:
    files = {f.upload_id: f for f in (to_sort_file(u) for u in uploads) if f is not None}
    unreadable = [u.id for u in uploads if u.id not in files]
    result = sort_files(list(files.values()))
    ai_reasons: dict[int, str] = {}
    ai_note = None
    if result.ambiguous:
        if may_use_ai and is_available():
            try:
                ai_reasons = resolve_ambiguous(result, files, meter)
            except AgentAIUnavailableError as exc:
                ai_note = str(exc)
        else:
            ai_note = "Có file khớp với nhiều bộ ngang nhau; AI chưa bật nên hãy kiểm tra kỹ các nhóm được đánh dấu."
    ambiguous_ids = {item["upload_id"] for item in result.ambiguous} - set(ai_reasons)
    groups = []
    for group in result.groups:
        members = set(group.files.values())
        groups.append(
            {
                "files": {doc_type: group.files.get(doc_type) for doc_type in DOC_TYPES},
                "complete": group.complete,
                "reasons": group.reasons,
                "needs_review": bool(members & ambiguous_ids) or not group.complete,
                "ai_reasons": [ai_reasons[m] for m in members if m in ai_reasons and ai_reasons[m]],
            }
        )
    return {
        "groups": groups,
        "unsorted": sorted(set(result.unsorted) | set(unreadable)),
        "ai_used": meter.calls > 0,
        "ai_note": ai_note,
    }


def apply_groups(
    db: Session, user: User, inbox: DocumentBatch, groups: list[dict[str, int | None]]
) -> list[DocumentBatch]:
    """Tạo bộ theo các nhóm người dùng đã duyệt. Mỗi nhóm: {po, invoice, grn} (id file trong bộ tạm, có thể thiếu)."""
    from src.api.uploads import create_document_batch, reconcile_ready_batch, update_batch_status
    from src.services.plans import ensure_can_create_batch, record_usage

    uploads = {u.id: u for u in inbox_files(db, inbox)}
    seen: set[int] = set()
    cleaned: list[dict[str, int]] = []
    for group in groups:
        members = {doc_type: upload_id for doc_type, upload_id in group.items() if upload_id is not None}
        for doc_type, upload_id in members.items():
            upload = uploads.get(upload_id)
            if upload is None or upload_id in seen:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Nhóm có file không nằm trong hộp chờ xếp hoặc bị lặp."
                )
            if doc_type not in DOC_TYPES or upload.doc_type != doc_type:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "File được đặt sai ô loại chứng từ.")
            seen.add(upload_id)
        if members:
            cleaned.append(members)
    if not cleaned:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chưa có nhóm nào để tạo bộ.")

    created: list[DocumentBatch] = []
    for members in cleaned:
        ensure_can_create_batch(db, user.organization)
        batch = create_document_batch(db, user)
        for upload_id in members.values():
            upload = uploads[upload_id]
            upload.batch_id = batch.id
            if upload.ai_extraction is not None:
                upload.ai_extraction.batch_id = batch.id
        db.flush()
        record_usage(db, batch.organization_id, batches=1)
        db.expire(batch)
        update_batch_status(db, batch)
        reconcile_ready_batch(db, batch)
        created.append(batch)
    return created

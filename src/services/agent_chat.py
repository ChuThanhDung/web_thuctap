"""Trợ lý hỏi đáp trên dữ liệu của công ty.

AI không viết SQL. Nó chỉ được gọi một bộ công cụ cố định, chỉ đọc. Mọi công cụ chạy trên session RLS của người hỏi
(chỉ thấy công ty mình) và lọc thêm theo quyền: kế toán viên chỉ thấy bộ của mình, như ở danh sách bộ.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models.reconciliation import DocumentBatch, UploadedFile
from src.models.user import User
from src.services.agent_llm import AgentMeter, chat_with_tools

MAX_ROWS = 20
MAX_BATCHES_SCANNED = 500

BATCH_STATUS = {
    "incomplete": "chưa đủ chứng từ",
    "ready": "đủ chứng từ (khớp/lệch nhỏ thì chờ kế toán viên duyệt; lệch lớn thì cần xử lý)",
    "approved": "chờ kế toán trưởng duyệt cuối",
    "final_approved": "đã duyệt cuối, lưu trữ",
    "rejected": "bị trả lại",
}
RESULT = {"matched": "khớp", "minor_diff": "lệch nhỏ (làm tròn)", "major_diff": "lệch lớn"}


def _number(value) -> float | None:
    if value is None:
        return None
    return float(value) if isinstance(value, Decimal) else value


class CompanyData:
    """Ảnh chụp các bộ người hỏi được xem, tính một lần cho cả lượt hỏi."""

    def __init__(self, db: Session, user: User):
        from src.api.uploads import can_access_batch, find_batch_reconciliation_case

        self.db = db
        self.user = user
        batches = db.scalars(
            select(DocumentBatch)
            .options(
                selectinload(DocumentBatch.files).selectinload(UploadedFile.ai_extraction),
                selectinload(DocumentBatch.created_by),
            )
            .where(DocumentBatch.is_inbox.is_(False))
            .order_by(DocumentBatch.created_at.desc())
            .limit(MAX_BATCHES_SCANNED)
        ).all()
        self.rows: list[dict] = []
        self.cases = {}
        today = datetime.now()
        for batch in batches:
            if not can_access_batch(user, batch):
                continue
            case = find_batch_reconciliation_case(db, batch) if batch.status != "incomplete" else None
            self.cases[batch.batch_number] = case
            updated = batch.updated_at or batch.created_at
            self.rows.append(
                {
                    "batch_number": batch.batch_number,
                    "id": batch.id,
                    "status": batch.status,
                    "status_text": BATCH_STATUS.get(batch.status, batch.status),
                    "result": case.status if case else None,
                    "result_text": RESULT.get(case.status) if case else None,
                    "supplier": case.partner_name if case else None,
                    "invoice_number": case.invoice_number if case else None,
                    "total_amount": _number(case.total_amount) if case else None,
                    "diff_amount": _number(case.diff_amount) if case else None,
                    "created_at": batch.created_at.strftime("%d/%m/%Y") if batch.created_at else None,
                    "month": batch.created_at.strftime("%Y-%m") if batch.created_at else None,
                    "days_waiting": (today - updated).days if updated else None,
                    "created_by": batch.created_by.full_name if batch.created_by else None,
                }
            )

    # --- công cụ -------------------------------------------------------------

    def list_batches(self, args: dict) -> dict:
        rows = self.rows
        if args.get("status"):
            rows = [r for r in rows if r["status"] == args["status"]]
        if args.get("result"):
            rows = [r for r in rows if r["result"] == args["result"]]
        if args.get("supplier"):
            needle = str(args["supplier"]).lower()
            rows = [r for r in rows if needle in (r["supplier"] or "").lower()]
        if args.get("month"):
            rows = [r for r in rows if r["month"] == args["month"]]
        if args.get("older_than_days") is not None:
            rows = [r for r in rows if (r["days_waiting"] or 0) >= int(args["older_than_days"])]
        keys = ("batch_number", "status_text", "result_text", "supplier", "total_amount", "created_at", "days_waiting")
        return {"total": len(rows), "items": [{k: r[k] for k in keys} for r in rows[:MAX_ROWS]]}

    def batch_detail(self, args: dict) -> dict:
        number = str(args.get("batch_number") or "").strip().upper()
        row = next((r for r in self.rows if r["batch_number"].upper() == number), None)
        if row is None:
            return {"error": "Không có bộ này hoặc bạn không có quyền xem."}
        case = self.cases.get(row["batch_number"])
        differences = []
        if case is not None:
            for line in case.line_items:
                if line.diff_type and line.diff_type != "MATCH":
                    differences.append({"item": line.item_name, "type": line.diff_type, "note": line.diff_note})
        return {
            **{k: row[k] for k in row if k not in ("id", "month")},
            "summary": case.ai_summary if case else None,
            "po_number": case.po_number if case else None,
            "grn_number": case.grn_number if case else None,
            "differences": differences[:MAX_ROWS],
        }

    def supplier_stats(self, args: dict) -> dict:
        month = args.get("month")
        stats: dict[str, dict] = {}
        for row in self.rows:
            if not row["supplier"] or (month and row["month"] != month):
                continue
            entry = stats.setdefault(
                row["supplier"],
                {"supplier": row["supplier"], "batches": 0, "major_diff": 0, "minor_diff": 0, "total": 0.0},
            )
            entry["batches"] += 1
            if row["result"] in ("major_diff", "minor_diff"):
                entry[row["result"]] += 1
            entry["total"] += row["total_amount"] or 0
        ordered = sorted(stats.values(), key=lambda e: (e["major_diff"], e["batches"]), reverse=True)
        return {"month": month or "tất cả", "suppliers": ordered[:MAX_ROWS]}

    def approval_queue(self, _args: dict) -> dict:
        # "ready" chỉ là đủ chứng từ; bộ lệch lớn chưa duyệt được nên không tính là đang chờ duyệt.
        waiting = [
            r
            for r in self.rows
            if r["status"] == "approved" or (r["status"] == "ready" and r["result"] in ("matched", "minor_diff"))
        ]
        waiting.sort(key=lambda r: r["days_waiting"] or 0, reverse=True)
        keys = ("batch_number", "status_text", "result_text", "supplier", "days_waiting", "created_by")
        return {"total": len(waiting), "items": [{k: r[k] for k in keys} for r in waiting[:MAX_ROWS]]}

    def usage_this_month(self, _args: dict) -> dict:
        from src.services.plans import limits_for, usage_summary

        plan, limits = limits_for(self.user.organization)
        usage = usage_summary(self.db, self.user.organization)
        return {
            "plan": plan,
            "batches": f"{usage['batches']}/{limits.batches_per_month}",
            "ai_files": f"{usage['ai_files']}/{limits.ai_files_per_month}",
            "agent_calls": f"{usage['agent_calls']}/{limits.agent_calls_per_month}",
        }


STATUS_ENUM = list(BATCH_STATUS)
RESULT_ENUM = list(RESULT)


def tool_specs(data: CompanyData) -> dict:
    def params(properties: dict) -> dict:
        return {"type": "object", "properties": properties, "additionalProperties": False}

    return {
        "list_batches": (
            {
                "description": "Liệt kê bộ chứng từ (tối đa 20, mới nhất trước) theo bộ lọc. Trả về tổng số khớp bộ lọc.",
                "parameters": params(
                    {
                        "status": {"type": "string", "enum": STATUS_ENUM},
                        "result": {"type": "string", "enum": RESULT_ENUM},
                        "supplier": {"type": "string", "description": "Một phần tên nhà cung cấp"},
                        "month": {"type": "string", "description": "YYYY-MM"},
                        "older_than_days": {"type": "integer", "description": "Đã nằm yên ít nhất N ngày"},
                    }
                ),
            },
            data.list_batches,
        ),
        "batch_detail": (
            {
                "description": "Chi tiết một bộ: trạng thái, kết quả, số chứng từ, các dòng lệch.",
                "parameters": {
                    **params({"batch_number": {"type": "string"}}),
                    "required": ["batch_number"],
                },
            },
            data.batch_detail,
        ),
        "supplier_stats": (
            {
                "description": "Thống kê theo nhà cung cấp: số bộ, số bộ lệch lớn/lệch nhỏ, tổng tiền hóa đơn.",
                "parameters": params({"month": {"type": "string", "description": "YYYY-MM, bỏ trống = tất cả"}}),
            },
            data.supplier_stats,
        ),
        "approval_queue": (
            {"description": "Các bộ đang chờ duyệt (cấp 1 hoặc duyệt cuối), lâu nhất trước.", "parameters": params({})},
            data.approval_queue,
        ),
        "usage_this_month": (
            {"description": "Gói dịch vụ và mức dùng tháng này.", "parameters": params({})},
            data.usage_this_month,
        ),
    }


def system_prompt(user: User) -> str:
    today = date.today()
    role = "kế toán trưởng" if user.role.code == "chief_accountant" else "kế toán viên"
    return (
        f"Bạn là trợ lý của DocuSync AI, phần mềm đối soát PO - Hóa đơn - Phiếu nhập kho. Người hỏi là {role} "
        f"{user.full_name} của {user.organization.name}. Hôm nay là {today:%d/%m/%Y} (tháng {today:%Y-%m}, tháng trước "
        f"{(today.replace(day=1) - timedelta(days=1)):%Y-%m}). "
        "Chỉ trả lời dựa trên dữ liệu lấy từ công cụ; không có dữ liệu thì nói không có, không đoán. "
        "Bạn chỉ đọc dữ liệu: không duyệt, không sửa, không xóa được gì; nếu được nhờ làm việc đó, hướng dẫn người dùng "
        "tự làm trên giao diện. Khi nhắc tới một bộ, ghi đúng mã bộ (ví dụ BATCH_02_11_2026_03). "
        "Trả lời tiếng Việt, ngắn gọn, dùng gạch đầu dòng '- ' khi liệt kê, KHÔNG dùng markdown (không **, #); "
        "tiền viết dạng 1.234.000 đ."
    )


def answer(db: Session, user: User, messages: list[dict], meter: AgentMeter) -> dict:
    data = CompanyData(db, user)
    text = chat_with_tools(system_prompt(user), messages, tool_specs(data), meter, max_steps=4)
    # Khung chat hiện chữ thô: bỏ dấu in đậm markdown nếu mô hình vẫn dùng.
    text = text.replace("**", "")
    mentioned = [
        {"batch_number": row["batch_number"], "id": row["id"]} for row in data.rows if row["batch_number"] in text
    ]
    return {"answer": text or "Xin lỗi, tôi chưa trả lời được câu này.", "batches": mentioned[:MAX_ROWS]}

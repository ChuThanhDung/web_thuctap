"""Trợ lý soạn thư gửi nhà cung cấp về chênh lệch của một bộ chứng từ.

Phần chênh lệch (mặt hàng, số lượng, đơn giá, tổng tiền) luôn dựng từ kết quả đối soát bằng mẫu cố định. AI chỉ viết
lời mở và lời đề nghị; câu AI viết có chứa con số không có trong dữ liệu thì bị bỏ, dùng câu mẫu. Thư chỉ được gửi
khi người dùng bấm gửi (endpoint riêng), có thể sửa nội dung trước.
"""

import json
import re
from decimal import Decimal

from sqlalchemy.orm import Session

from src.models.reconciliation import DocumentBatch, ReconciliationCase
from src.models.user import User
from src.services.agent_llm import AgentAIUnavailableError, AgentMeter, complete_json, is_available

ISSUE_LABELS = {"QTY_DIFF": "Số lượng", "PRICE_DIFF": "Đơn giá", "TAX_DIFF": "Thuế suất", "MISSING": "Thiếu dòng"}


def money(value) -> str:
    if value in (None, ""):
        return "—"
    amount = Decimal(str(value))
    text = f"{amount:,.0f}" if amount == amount.to_integral() else f"{amount:,.2f}"
    return text.replace(",", ".") + " đ"


def qty(value) -> str:
    if value in (None, ""):
        return "—"
    amount = Decimal(str(value))
    return f"{amount.normalize():f}".replace(".", ",")


def find_case(db: Session, batch: DocumentBatch) -> ReconciliationCase | None:
    from src.api.uploads import find_batch_reconciliation_case

    return find_batch_reconciliation_case(db, batch)


def collect_facts(case: ReconciliationCase) -> dict:
    lines = []
    for line in sorted(case.line_items, key=lambda item: item.row_index or 0):
        if not line.diff_type or line.diff_type == "MATCH":
            continue
        lines.append(
            {
                "item": line.item_name or line.item_sku or f"Dòng {line.row_index}",
                "unit": line.unit or "",
                "po_qty": qty(line.po_qty),
                "grn_qty": qty(line.grn_qty),
                "inv_qty": qty(line.inv_qty),
                "po_price": money(line.po_unit_price),
                "inv_price": money(line.inv_unit_price),
                "issue": ISSUE_LABELS.get(line.diff_type, line.diff_type),
                "note": line.diff_note or "",
            }
        )
    return {
        "supplier": case.partner_name or "",
        "tax_id": case.partner_tax_id or "",
        "po_number": case.po_number or "",
        "invoice_number": case.invoice_number or "",
        "grn_number": case.grn_number or "",
        "invoice_total": money(case.total_amount),
        "diff_amount": money(case.diff_amount),
        "status": case.status,
        "summary": case.ai_summary or "",
        "lines": lines,
    }


def discrepancy_block(facts: dict) -> str:
    rows = []
    for index, line in enumerate(facts["lines"], 1):
        if line["issue"] == "Đơn giá":
            detail = f"đơn giá trên hóa đơn {line['inv_price']}, theo đơn đặt hàng {line['po_price']}"
        else:
            unit = f" {line['unit']}" if line["unit"] else ""
            detail = (
                f"số lượng đặt {line['po_qty']}{unit}, thực nhận {line['grn_qty']}{unit}, "
                f"trên hóa đơn {line['inv_qty']}{unit}"
            )
        rows.append(f"{index}. {line['item']} ({line['issue'].lower()}): {detail}.")
    if not rows:
        rows.append(f"- Chênh lệch tổng tiền giữa các chứng từ: {facts['diff_amount']}.")
    elif facts["diff_amount"] not in ("—", "0 đ"):
        rows.append(f"Tổng chênh lệch: {facts['diff_amount']}.")
    return "\n".join(rows)


def references(facts: dict) -> str:
    parts = []
    if facts["invoice_number"]:
        parts.append(f"hóa đơn số {facts['invoice_number']}")
    if facts["po_number"]:
        parts.append(f"đơn đặt hàng {facts['po_number']}")
    if facts["grn_number"]:
        parts.append(f"phiếu nhập kho {facts['grn_number']}")
    return ", ".join(parts) or "bộ chứng từ mua hàng gần đây"


TEMPLATE = {
    "greeting": "Kính gửi Quý công ty,",
    "intro": "Trong quá trình đối chiếu chứng từ, chúng tôi nhận thấy một số điểm chưa khớp giữa hóa đơn, đơn đặt "
    "hàng và phiếu nhập kho như sau:",
    "request": "Kính đề nghị Quý công ty kiểm tra và phát hành hóa đơn điều chỉnh hoặc hóa đơn thay thế (nếu "
    "cần), hoặc phản hồi để hai bên thống nhất số liệu.",
    "closing": "Trân trọng cảm ơn sự hợp tác của Quý công ty.",
}

LETTER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["greeting", "intro", "request", "closing"],
    "properties": {key: {"type": "string"} for key in ("greeting", "intro", "request", "closing")},
}
LETTER_SYSTEM = (
    "Bạn là kế toán của bên mua, viết thư công việc tiếng Việt lịch sự, ngắn gọn gửi nhà cung cấp về chênh lệch "
    "chứng từ. Viết 4 phần: greeting (1 dòng), intro (1-2 câu dẫn vào danh sách chênh lệch sẽ được chèn ngay sau), "
    "request (1-2 câu đề nghị phù hợp loại chênh lệch: điều chỉnh/thay thế hóa đơn, giao bù hàng, hoặc giải trình), "
    "closing (1 câu). TUYỆT ĐỐI KHÔNG viết bất kỳ con số, số tiền, số lượng, số chứng từ nào: danh sách chi tiết "
    "đã có sẵn."
)

DIGITS = re.compile(r"\d")


def _clean(answer: dict) -> dict | None:
    """Câu AI viết có số thì bỏ cả phần đó (số liệu chỉ được đến từ dữ liệu)."""
    cleaned = {}
    for key, fallback in TEMPLATE.items():
        text = str(answer.get(key) or "").strip()
        cleaned[key] = text if text and not DIGITS.search(text) and len(text) < 600 else fallback
    return cleaned


def draft_letter(
    facts: dict, user: User, organization_name: str, meter: AgentMeter, *, may_use_ai: bool
) -> tuple[dict, bool]:
    parts = dict(TEMPLATE)
    ai_used = False
    if may_use_ai and is_available():
        context = {
            "nha_cung_cap": facts["supplier"],
            "loai_chenh_lech": sorted({line["issue"] for line in facts["lines"]}) or ["tổng tiền"],
            "muc_do": "lệch lớn" if facts["status"] == "major_diff" else "lệch nhỏ",
        }
        try:
            answer = complete_json(
                LETTER_SYSTEM, json.dumps(context, ensure_ascii=False), LETTER_SCHEMA, meter, name="thu_ncc"
            )
            parts = _clean(answer) or parts
            ai_used = True
        except AgentAIUnavailableError:
            pass
    subject = f"Đề nghị đối chiếu {references(facts)}"
    signature = "\n".join(line for line in (user.full_name, user.email, organization_name) if line)
    body = (
        f"{parts['greeting']}\n\n"
        f"{parts['intro']}\n"
        f"Chứng từ liên quan: {references(facts)}.\n\n"
        f"{discrepancy_block(facts)}\n\n"
        f"{parts['request']}\n\n"
        f"{parts['closing']}\n\n"
        f"{signature}"
    )
    return {"subject": subject[:200], "body": body}, ai_used

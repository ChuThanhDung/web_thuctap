"""Xếp một đống chứng từ lẫn lộn thành các bộ PO · HĐ · GRN.

Quy tắc trước, AI sau: mỗi cặp file khác loại được chấm điểm bằng dấu hiệu rõ ràng (MST, số đơn hàng ghi chéo, mặt
hàng trùng, tên nhà cung cấp, tổng tiền, ngày). Ghép tham lam theo điểm cao nhất. Chỉ khi một file có hai nơi đặt
điểm sát nhau thì mới hỏi AI (một lần cho cả lượt xếp), và AI chỉ được chọn trong các nơi quy tắc đã đưa ra.

Đầu vào là dữ liệu đã trích xuất và chuẩn hóa (normalize_extracted_document), không bao giờ là file gốc.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

DOC_TYPES = ("po", "invoice", "grn")
DOC_LABELS = {"po": "PO", "invoice": "HĐ", "grn": "GRN"}

# Hai file được coi là cùng giao dịch khi đạt từ ngưỡng này.
LINK_THRESHOLD = 40
# Hai nơi đặt chênh nhau ít hơn mức này thì coi là mơ hồ.
AMBIGUITY_MARGIN = 12
INCOMPATIBLE = -1000

LEGAL_FORM = re.compile(
    r"\b(cong ty|cty)\b|\b(tnhh|co phan|cp|trach nhiem huu han|mot thanh vien|hai thanh vien|mtv)\b"
)


@dataclass
class SortFile:
    upload_id: int
    doc_type: str
    data: dict
    filename: str = ""


@dataclass
class PairScore:
    score: int
    reasons: list[str] = field(default_factory=list)


@dataclass
class SortGroup:
    files: dict[str, int]
    reasons: list[str]
    score: int

    @property
    def complete(self) -> bool:
        return all(doc_type in self.files for doc_type in DOC_TYPES)


@dataclass
class SortResult:
    groups: list[SortGroup]
    unsorted: list[int]
    ambiguous: list[dict]


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn").replace("đ", "d").replace("Đ", "D")


def name_tokens(value: str | None) -> set[str]:
    if not value:
        return set()
    text = strip_accents(str(value)).lower()
    text = LEGAL_FORM.sub(" ", text)
    return {token for token in re.split(r"[^a-z0-9]+", text) if len(token) > 1}


def normalize_code(value) -> str:
    return re.sub(r"[^a-z0-9]", "", strip_accents(str(value or "")).lower())


def to_decimal(value) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def parse_date(value) -> date | None:
    if not value:
        return None
    text = str(value).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def item_keys(data: dict) -> set[str]:
    keys = set()
    for item in data.get("line_items") or []:
        sku = normalize_code(item.get("sku"))
        name = " ".join(sorted(name_tokens(item.get("item_name"))))
        if sku:
            keys.add(f"sku:{sku}")
        if name:
            keys.add(f"name:{name}")
    return keys


def item_count(data: dict) -> int:
    return len(data.get("line_items") or [])


def own_number(sort_file: SortFile) -> str:
    data = sort_file.data
    return normalize_code(data.get(f"{sort_file.doc_type}_number") or data.get("document_number"))


def referenced_po(sort_file: SortFile) -> str:
    """Số PO mà hóa đơn/phiếu nhập ghi lại. Với PO thì là chính số của nó."""
    return normalize_code(sort_file.data.get("po_number"))


def score_pair(a: SortFile, b: SortFile) -> PairScore:
    """Điểm cho giả thuyết 'a và b thuộc cùng một giao dịch'. Âm rất lớn = chắc chắn khác giao dịch."""
    if a.doc_type == b.doc_type:
        return PairScore(INCOMPATIBLE)
    score = 0
    reasons: list[str] = []

    tax_a, tax_b = normalize_code(a.data.get("supplier_tax_id")), normalize_code(b.data.get("supplier_tax_id"))
    if tax_a and tax_b:
        if tax_a != tax_b:
            return PairScore(INCOMPATIBLE, ["khác MST nhà cung cấp"])
        score += 35
        reasons.append(f"cùng MST {a.data.get('supplier_tax_id')}")

    names_a, names_b = name_tokens(a.data.get("supplier_name")), name_tokens(b.data.get("supplier_name"))
    if names_a and names_b:
        overlap = len(names_a & names_b) / max(1, min(len(names_a), len(names_b)))
        if overlap >= 0.6:
            score += 15
            if not (tax_a and tax_b):
                reasons.append("cùng tên nhà cung cấp")
        elif not (tax_a and tax_b) and overlap < 0.2:
            score -= 40

    po_a, po_b = referenced_po(a), referenced_po(b)
    if po_a and po_b and po_a == po_b:
        score += 45
        reasons.append(f"cùng số đơn hàng {a.data.get('po_number')}")
    elif po_a and po_b and po_a != po_b:
        score -= 30

    keys_a, keys_b = item_keys(a.data), item_keys(b.data)
    if keys_a and keys_b:
        count_a, count_b = item_count(a.data) or 1, item_count(b.data) or 1
        matched = len({key.split(":", 1)[1] for key in keys_a & keys_b})
        ratio = min(1.0, matched / min(count_a, count_b))
        score += round(35 * ratio)
        if ratio >= 0.5:
            reasons.append(f"{min(matched, min(count_a, count_b))}/{min(count_a, count_b)} mặt hàng trùng")
        elif ratio == 0:
            score -= 20

    total_a, total_b = to_decimal(a.data.get("total_amount")), to_decimal(b.data.get("total_amount"))
    if total_a and total_b and abs(total_a - total_b) <= 1000:
        score += 10
        reasons.append("cùng tổng tiền")

    date_a, date_b = parse_date(a.data.get("document_date")), parse_date(b.data.get("document_date"))
    if date_a and date_b:
        gap = abs((date_a - date_b).days)
        if gap <= 31:
            score += 5
        elif gap > 120:
            score -= 15

    return PairScore(score, reasons)


def _merge_reasons(*lists: list[str]) -> list[str]:
    seen: list[str] = []
    for items in lists:
        for item in items:
            if item not in seen:
                seen.append(item)
    return seen


def _anchor(group: dict[str, int]) -> int:
    return group.get("po") or group.get("invoice") or next(iter(group.values()))


def sort_files(files: list[SortFile]) -> SortResult:
    """Ghép bằng quy tắc. Trả về các nhóm, file chưa xếp được và các quyết định mơ hồ (để hỏi AI nếu muốn)."""
    by_id = {f.upload_id: f for f in files}
    pairs: dict[tuple[int, int], PairScore] = {}
    for i, a in enumerate(files):
        for b in files[i + 1 :]:
            if a.doc_type != b.doc_type:
                result = score_pair(a, b)
                pairs[(a.upload_id, b.upload_id)] = result
                pairs[(b.upload_id, a.upload_id)] = result

    def pair(a: int, b: int) -> PairScore:
        return pairs.get((a, b), PairScore(INCOMPATIBLE))

    # Mỗi nhóm bắt đầu từ một PO; còn hóa đơn/phiếu nhập không có PO nào hợp thì nhóm bắt đầu từ hóa đơn.
    groups: list[dict[str, int]] = [{"po": f.upload_id} for f in files if f.doc_type == "po"]
    placed = {group["po"] for group in groups}
    ambiguous: list[dict] = []

    def group_fit(group: dict[str, int], candidate: SortFile) -> int | None:
        """Điểm khi thêm candidate vào nhóm: trung bình điểm với các file đã có, None nếu xung đột."""
        if candidate.doc_type in group:
            return None
        scores = [pair(member, candidate.upload_id).score for member in group.values()]
        if any(score <= INCOMPATIBLE // 2 for score in scores):
            return None
        return round(sum(scores) / len(scores))

    def place(doc_types: tuple[str, ...]) -> None:
        # Lặp: mỗi vòng đặt cặp (file, nhóm) có điểm cao nhất, để file khớp rõ được ưu tiên trước.
        while True:
            best: tuple[int, int, int] | None = None
            for candidate in files:
                if candidate.upload_id in placed or candidate.doc_type not in doc_types:
                    continue
                for index, group in enumerate(groups):
                    fit = group_fit(group, candidate)
                    if fit is not None and fit >= LINK_THRESHOLD and (best is None or fit > best[0]):
                        best = (fit, candidate.upload_id, index)
            if best is None:
                return
            fit, upload_id, index = best
            runner_up = [
                (other_fit, other_index)
                for other_index, group in enumerate(groups)
                if other_index != index
                and (other_fit := group_fit(group, by_id[upload_id])) is not None
                and other_fit >= LINK_THRESHOLD
                and fit - other_fit < AMBIGUITY_MARGIN
            ]
            if runner_up:
                # Định danh nhóm bằng file gốc (PO hoặc hóa đơn) vì thứ tự nhóm còn đổi khi bỏ nhóm lẻ.
                anchors = [_anchor(groups[i]) for i in [index] + [other_index for _f, other_index in runner_up]]
                ambiguous.append({"upload_id": upload_id, "anchors": anchors})
            groups[index][by_id[upload_id].doc_type] = upload_id
            placed.add(upload_id)

    place(("invoice", "grn"))
    # Hóa đơn chưa có PO làm gốc cho phiếu nhập còn lại.
    for f in files:
        if f.doc_type == "invoice" and f.upload_id not in placed:
            groups.append({"invoice": f.upload_id})
            placed.add(f.upload_id)
    place(("grn",))

    result_groups: list[SortGroup] = []
    unsorted: list[int] = []
    for group in groups:
        if len(group) == 1:
            unsorted.extend(group.values())
            continue
        members = list(group.values())
        reason_lists = []
        total = 0
        count = 0
        for i, a in enumerate(members):
            for b in members[i + 1 :]:
                scored = pair(a, b)
                reason_lists.append(scored.reasons)
                total += scored.score
                count += 1
        result_groups.append(
            SortGroup(files=dict(group), reasons=_merge_reasons(*reason_lists), score=round(total / max(1, count)))
        )
    unsorted.extend(f.upload_id for f in files if f.upload_id not in placed)
    return SortResult(groups=result_groups, unsorted=sorted(set(unsorted)), ambiguous=ambiguous)


def summarize_file(sort_file: SortFile, max_items: int = 5) -> dict:
    """Bản tóm tắt ngắn gửi AI khi cần phân xử: không có giá, không có file gốc."""
    data = sort_file.data
    return {
        "id": sort_file.upload_id,
        "loai": DOC_LABELS.get(sort_file.doc_type, sort_file.doc_type),
        "so_chung_tu": data.get(f"{sort_file.doc_type}_number") or data.get("document_number"),
        "so_po_ghi_tren_chung_tu": data.get("po_number"),
        "nha_cung_cap": data.get("supplier_name"),
        "mst": data.get("supplier_tax_id"),
        "ngay": data.get("document_date"),
        "tong_tien": data.get("total_amount"),
        "mat_hang": [
            {"ten": item.get("item_name"), "sl": item.get("qty")} for item in (data.get("line_items") or [])[:max_items]
        ],
    }

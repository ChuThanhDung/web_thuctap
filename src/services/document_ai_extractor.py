import io
import json
import logging
import mimetypes
import re
import zipfile
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from openai import OpenAI

from src.config import get_settings
from src.services.document_parser import detect_and_parse_document
from src.services.parser_strategies import LocalOcrParserStrategy

DOC_TYPE_LABELS = {
    "po": "Don dat hang (PO)",
    "invoice": "Hoa don (Invoice)",
    "grn": "Phieu nhap kho (GRN)",
    "auto": "Tu nhan dien chung tu",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
PDF_EXTENSIONS = {".pdf"}
XML_EXTENSIONS = {".xml"}
DOCX_EXTENSIONS = {".docx"}
DOC_EXTENSIONS = {".doc"}
OFFICE_OPEN_XML_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
LEGACY_DOC_CONTENT_TYPES = {"application/msword"}
LOW_IMAGE_QUALITY_WARNING = (
    "Chất lượng file thấp, dữ liệu trích xuất có thể không chính xác. Vui lòng kiểm tra lại dữ liệu trích xuất."
)
UNREADABLE_PDF_MESSAGE = "File PDF bị lỗi hoặc không thể đọc nội dung. Vui lòng kiểm tra và tải lại file khác."
UNREADABLE_FILE_MESSAGE = "File tải lên bị lỗi hoặc không thể đọc nội dung. Vui lòng kiểm tra và tải lại file khác."
UNREADABLE_IMAGE_MESSAGE = "File ảnh bị lỗi hoặc không thể đọc nội dung. Vui lòng kiểm tra và tải lại file khác."
UNREADABLE_XML_MESSAGE = "File XML bị lỗi hoặc không thể đọc nội dung. Vui lòng kiểm tra và tải lại file khác."
UNREADABLE_DOC_MESSAGE = "File Word bị lỗi hoặc không thể đọc nội dung. Vui lòng kiểm tra và tải lại file khác."
logger = logging.getLogger(__name__)


@dataclass
class DocumentAiAnalysis:
    expected_doc_type: str
    detected_doc_type: str | None
    is_correct_type: bool
    confidence: Decimal | None
    status: str
    validation_message: str | None
    model_name: str | None
    extracted_data: dict[str, Any]
    raw_response: dict[str, Any]


@dataclass
class ImageQualityAnalysis:
    is_low_quality: bool
    metrics: dict[str, Any]


class UnreadableDocumentError(ValueError):
    pass


def _json_schema() -> dict[str, Any]:
    line_item_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "row_index",
            "sku",
            "item_name",
            "unit",
            "qty",
            "price",
            "vat_rate_pct",
            "amount",
        ],
        "properties": {
            "row_index": {"type": ["number", "null"]},
            "sku": {"type": ["string", "null"]},
            "item_name": {"type": ["string", "null"]},
            "unit": {"type": ["string", "null"]},
            "qty": {"type": ["number", "null"]},
            "price": {"type": ["number", "null"]},
            "vat_rate_pct": {"type": ["number", "null"]},
            "amount": {"type": ["number", "null"]},
        },
    }
    extracted_data_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "type",
            "document_number",
            "document_date",
            "po_number",
            "invoice_number",
            "grn_number",
            "supplier_name",
            "supplier_tax_id",
            "buyer_name",
            "total_amount",
            "vat_rate_pct",
            "line_items",
        ],
        "properties": {
            "type": {"type": ["string", "null"]},
            "document_number": {"type": ["string", "null"]},
            "document_date": {"type": ["string", "null"]},
            "po_number": {"type": ["string", "null"]},
            "invoice_number": {"type": ["string", "null"]},
            "grn_number": {"type": ["string", "null"]},
            "supplier_name": {"type": ["string", "null"]},
            "supplier_tax_id": {"type": ["string", "null"]},
            "buyer_name": {"type": ["string", "null"]},
            "total_amount": {"type": ["number", "null"]},
            "vat_rate_pct": {"type": ["number", "null"]},
            "line_items": {"type": "array", "items": line_item_schema},
        },
    }
    return {
        "name": "document_extraction_result",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "detected_doc_type",
                "is_correct_type",
                "confidence",
                "validation_message",
                "extracted_data",
            ],
            "properties": {
                "detected_doc_type": {"type": "string", "enum": ["po", "invoice", "grn", "unknown"]},
                "is_correct_type": {"type": "boolean"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "validation_message": {"type": "string"},
                "extracted_data": extracted_data_schema,
            },
        },
        "strict": True,
    }


def _build_prompt(expected_doc_type: str, filename: str) -> str:
    expected_label = DOC_TYPE_LABELS.get(expected_doc_type, expected_doc_type.upper())
    doc_options = ", ".join(f"{key}={label}" for key, label in DOC_TYPE_LABELS.items() if key != "auto")
    correctness_instruction = (
        "Dat is_correct_type=true khi da nhan dien duoc mot trong cac loai po, invoice, grn."
        if expected_doc_type == "auto"
        else "Dat is_correct_type=true chi khi loai phat hien trung voi loai nguoi dung da chon."
    )
    return f"""
Ban la AI ke toan doc chung tu mua hang. Hay doc file dinh kem va tra ve JSON theo schema.

Nguoi dung dang upload vao o loai: {expected_doc_type} ({expected_label}).
Ten file: {filename}

Nhiem vu:
1. Tu noi dung file, nhan dien chung tu thuc su thuoc loai nao trong: {doc_options}. Neu khong du bang chung, dung "unknown".
2. {correctness_instruction}
3. Trich xuat cac truong co trong chung tu de doi soat:
   - So chung tu, ngay chung tu.
   - Nha cung cap, ma so thue, don vi mua neu co.
   - Tong tien, thue VAT neu co.
   - Danh sach hang hoa: SKU/ma hang, ten hang, don vi tinh, so luong, don gia, thue, thanh tien.
   - BAT BUOC trich DAY DU TAT CA cac dong hang tren MOI TRANG, dung thu tu, khong bo dong, khong tom tat, khong dung
     giua chung du bang dai hang tram dong. row_index la so thu tu (STT) ghi tren chung tu.
4. Khong tu bia du lieu. Truong khong thay thi de null hoac mang rong.
5. validation_message phai ngan gon bang tieng Viet, noi ro dung loai hay upload nham loai nao.
""".strip()


def _extract_response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return str(output_text)

    output = getattr(response, "output", None) or []
    text_parts: list[str] = []
    for item in output:
        content = getattr(item, "content", None) or []
        for block in content:
            text = getattr(block, "text", None)
            if text:
                text_parts.append(str(text))
    if text_parts:
        return "\n".join(text_parts)

    return str(response)


def _parse_json_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _content_type(filename: str, provided_content_type: str | None) -> str:
    guessed = mimetypes.guess_type(filename)[0]
    return provided_content_type or guessed or "application/octet-stream"


def _content_type_base(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def _is_image_upload(filename: str, content_type: str | None) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in IMAGE_EXTENSIONS or _content_type_base(content_type).startswith("image/")


def _is_pdf_upload(filename: str, content_type: str | None) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in PDF_EXTENSIONS or _content_type_base(content_type) == "application/pdf"


def _is_xml_upload(filename: str, content_type: str | None) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in XML_EXTENSIONS or _content_type_base(content_type) in {"application/xml", "text/xml"}


def _is_docx_upload(filename: str, content_type: str | None) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in DOCX_EXTENSIONS or _content_type_base(content_type) in OFFICE_OPEN_XML_CONTENT_TYPES


def _is_doc_upload(filename: str, content_type: str | None) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in DOC_EXTENSIONS or _content_type_base(content_type) in LEGACY_DOC_CONTENT_TYPES


def validate_readable_pdf(content: bytes, filename: str, content_type: str | None) -> None:
    if not _is_pdf_upload(filename, content_type):
        return

    sample = content[:2048].lstrip()
    trailer = content[-4096:]
    if not sample.startswith(b"%PDF-"):
        raise UnreadableDocumentError(UNREADABLE_PDF_MESSAGE)

    has_eof_marker = b"%%EOF" in trailer
    has_xref_pointer = b"startxref" in trailer
    has_page_marker = b"/Page" in content or b"/Type /Page" in content
    if not (has_eof_marker and has_xref_pointer and has_page_marker):
        raise UnreadableDocumentError(UNREADABLE_PDF_MESSAGE)


def validate_readable_image(content: bytes, filename: str, content_type: str | None) -> None:
    if not _is_image_upload(filename, content_type):
        return

    try:
        from PIL import Image, UnidentifiedImageError
    except Exception as exc:
        logger.info("Pillow is unavailable; skipping image readability validation for %s: %s", filename, exc)
        return

    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise UnreadableDocumentError(UNREADABLE_IMAGE_MESSAGE) from exc


def validate_readable_xml(content: bytes, filename: str, content_type: str | None) -> None:
    if not _is_xml_upload(filename, content_type):
        return

    try:
        ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise UnreadableDocumentError(UNREADABLE_XML_MESSAGE) from exc


def validate_readable_docx(content: bytes, filename: str, content_type: str | None) -> None:
    if not _is_docx_upload(filename, content_type):
        return

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise UnreadableDocumentError(UNREADABLE_DOC_MESSAGE)
            bad_member = archive.testzip()
            if bad_member is not None:
                raise UnreadableDocumentError(UNREADABLE_DOC_MESSAGE)
    except zipfile.BadZipFile as exc:
        raise UnreadableDocumentError(UNREADABLE_DOC_MESSAGE) from exc


def validate_readable_doc(content: bytes, filename: str, content_type: str | None) -> None:
    if not _is_doc_upload(filename, content_type):
        return

    ole_header = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    if not content.startswith(ole_header):
        raise UnreadableDocumentError(UNREADABLE_DOC_MESSAGE)


def validate_readable_upload(content: bytes, filename: str, content_type: str | None) -> None:
    if not content:
        raise UnreadableDocumentError(UNREADABLE_FILE_MESSAGE)

    validate_readable_pdf(content, filename, content_type)
    validate_readable_image(content, filename, content_type)
    validate_readable_xml(content, filename, content_type)
    validate_readable_docx(content, filename, content_type)
    validate_readable_doc(content, filename, content_type)


def _analyze_image_quality(content: bytes, filename: str, content_type: str | None) -> ImageQualityAnalysis | None:
    if not _is_image_upload(filename, content_type):
        return None

    try:
        from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError
    except Exception as exc:
        logger.info("Pillow is unavailable; skipping image quality analysis for %s: %s", filename, exc)
        return None

    try:
        with Image.open(io.BytesIO(content)) as image:
            image = ImageOps.exif_transpose(image).convert("L")
            image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
            width, height = image.size

            contrast = ImageStat.Stat(image).stddev[0]
            edge_image = image.filter(ImageFilter.FIND_EDGES)
            edge_stat = ImageStat.Stat(edge_image)
            edge_score = edge_stat.mean[0] + edge_stat.stddev[0]
            high_frequency = ImageChops.difference(image, image.filter(ImageFilter.GaussianBlur(radius=2)))
            sharpness_score = ImageStat.Stat(high_frequency).stddev[0]
    except (UnidentifiedImageError, OSError) as exc:
        logger.info("Cannot inspect image quality for %s: %s", filename, exc)
        return None

    min_dimension = min(width, height)
    low_quality_signals = [
        min_dimension < 900,
        contrast < 22,
        edge_score < 18,
        sharpness_score < 6,
    ]
    metrics = {
        "width": width,
        "height": height,
        "min_dimension": min_dimension,
        "contrast": round(contrast, 2),
        "edge_score": round(edge_score, 2),
        "sharpness_score": round(sharpness_score, 2),
        "low_quality_signal_count": sum(low_quality_signals),
    }
    return ImageQualityAnalysis(is_low_quality=sum(low_quality_signals) >= 2, metrics=metrics)


@lru_cache(maxsize=4)
def _get_openai_client(api_key: str, timeout: float) -> OpenAI:
    """Dùng lại một client (giữ kết nối) thay vì tạo mới cho mỗi file."""
    return OpenAI(api_key=api_key, timeout=timeout, max_retries=1)


def _responses_kwargs(settings) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "model": settings.openai_document_model,
        "text": {"format": {"type": "json_schema", **_json_schema()}},
    }
    if settings.openai_reasoning_effort:
        kwargs["reasoning"] = {"effort": settings.openai_reasoning_effort}
    return kwargs


def _run_openai_analysis(
    content: bytes, filename: str, content_type: str | None, expected_doc_type: str
) -> dict[str, Any]:
    import base64

    settings = get_settings()
    client = _get_openai_client(settings.openai_api_key, settings.openai_timeout_seconds)
    prompt = _build_prompt(expected_doc_type, filename)
    mime_type = _content_type(filename, content_type)
    suffix = Path(filename).suffix.lower()
    base64_file = base64.b64encode(content).decode("utf-8")
    uploaded_file_id: str | None = None

    if suffix in IMAGE_EXTENSIONS:
        file_part = {
            "type": "input_image",
            "image_url": f"data:{mime_type};base64,{base64_file}",
            "detail": settings.openai_image_detail,
        }
    elif suffix in PDF_EXTENSIONS:
        # Gửi PDF trực tiếp trong request: bớt một vòng gọi tải file lên và không để file thừa trên OpenAI.
        file_part = {
            "type": "input_file",
            "filename": filename,
            "file_data": f"data:application/pdf;base64,{base64_file}",
        }
    else:
        uploaded_file = client.files.create(file=(filename, io.BytesIO(content), mime_type), purpose="user_data")
        uploaded_file_id = uploaded_file.id
        file_part = {"type": "input_file", "file_id": uploaded_file_id}

    def ask(text: str) -> dict[str, Any]:
        response = client.responses.create(
            input=[{"role": "user", "content": [{"type": "input_text", "text": text}, file_part]}],
            **_responses_kwargs(settings),
        )
        return _parse_json_text(_extract_response_text(response))

    try:
        result = ask(prompt)
        shortfall = _line_items_shortfall(result.get("extracted_data"))
        if shortfall:
            # Model nhỏ hay dừng giữa bảng dài: gọi lại một lần, nói rõ lần trước thiếu, giữ kết quả nhiều dòng hơn.
            logger.warning("Trích thiếu dòng hàng ở %s (%s), gọi lại AI", filename, shortfall)
            retry = ask(f"{prompt}\n\nLAN TRUOC TRICH THIEU: {shortfall}. Hay trich lai DAY DU moi dong hang.")
            if len((retry.get("extracted_data") or {}).get("line_items") or []) > len(
                (result.get("extracted_data") or {}).get("line_items") or []
            ):
                result = retry
            shortfall = _line_items_shortfall(result.get("extracted_data"))
            if shortfall:
                result["completeness_warning"] = shortfall
    finally:
        if uploaded_file_id:
            try:
                client.files.delete(uploaded_file_id)
            except Exception:  # dọn dẹp là cố gắng tối đa, không làm hỏng kết quả
                logger.warning("Không xóa được file tạm %s trên OpenAI", uploaded_file_id)

    return result


def _line_items_shortfall(extracted: Any) -> str | None:
    """So tổng các dòng hàng với tổng chứng từ (trước hoặc sau VAT); trả mô tả thiếu, None nếu đủ hoặc không đo được."""
    if not isinstance(extracted, dict):
        return None
    total = _to_number(extracted.get("total_amount"))
    if not total or total <= 0:
        return None
    items = extracted.get("line_items") or []
    lines_sum = 0.0
    for item in items:
        if not isinstance(item, dict):
            continue
        amount = _to_number(item.get("amount"))
        if not amount:
            amount = (_to_number(item.get("qty")) or 0) * (_to_number(item.get("price")) or 0)
        lines_sum += amount
    vat = _to_number(extracted.get("vat_rate_pct")) or 0
    # Chấp nhận tổng dòng khớp tổng chứng từ chưa VAT hoặc đã VAT (phiếu nhập kho thường không có thuế), lệch tới 2%.
    for expected in (total, total / (1 + vat / 100) if vat > 0 else total, total / 1.08, total / 1.1):
        if abs(lines_sum - expected) <= expected * 0.02:
            return None
    if lines_sum >= total * 0.9:
        return None  # không thiếu rõ ràng (có thể khác cách tính thuế); để engine đối soát báo lệch nếu có
    return f"chi trich {len(items)} dong, tong cac dong {lines_sum:,.0f} nho hon tong chung tu {total:,.0f}"


LINE_AMOUNT_ROUNDING_TOLERANCE = 1000  # VND, khớp ngưỡng làm tròn tiền mặc định của engine


def _correct_misread_line_amounts(result: dict[str, Any]) -> None:
    """Thành tiền lệch số lượng x đơn giá quá mức làm tròn gần như chắc là AI đọc nhầm chữ số: lấy số lượng x đơn giá.

    Không che gian lận: tổng tiền chứng từ được đọc riêng, nên thành tiền ghi sai thật vẫn làm tổng lệch và bị báo.
    """
    extracted = result.get("extracted_data")
    if not isinstance(extracted, dict):
        return
    corrected = []
    for item in extracted.get("line_items") or []:
        if not isinstance(item, dict):
            continue
        qty, price, amount = (_to_number(item.get(key)) for key in ("qty", "price", "amount"))
        if not qty or not price or amount is None:
            continue
        expected = qty * price
        if abs(amount - expected) > LINE_AMOUNT_ROUNDING_TOLERANCE:
            corrected.append({"row_index": item.get("row_index"), "read": amount, "used": expected})
            item["amount"] = expected
    if corrected:
        result["corrected_line_amounts"] = corrected


def _to_number(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _infer_doc_type_offline(content: bytes, filename: str) -> str:
    sample = content[:8192].decode("utf-8", errors="ignore").lower()
    # "01_purchase_order.pdf", "goods-receipt.pdf": coi gạch dưới/gạch ngang trong tên file như khoảng trắng.
    name = re.sub(r"[_\-.]+", " ", filename.lower())
    text = f"{name} {sample}"
    if any(keyword in text for keyword in ["grn", "goods receipt", "phieu nhap", "phiếu nhập", "receipt"]):
        return "grn"
    if any(keyword in text for keyword in ["invoice", "hoa don", "hóa đơn", "invoicenumber"]):
        return "invoice"
    if any(keyword in text for keyword in ["purchase order", "don dat hang", "đơn đặt hàng"]) or re.search(
        r"\bpo\b", text
    ):
        return "po"
    return "unknown"


def _offline_analysis(content: bytes, filename: str, expected_doc_type: str) -> dict[str, Any]:
    detected_doc_type = _infer_doc_type_offline(content, filename) if expected_doc_type == "auto" else expected_doc_type
    parse_doc_type = detected_doc_type if detected_doc_type in {"po", "invoice", "grn"} else "invoice"
    try:
        extracted_data = LocalOcrParserStrategy().parse(content, filename, parse_doc_type)
    except Exception:
        extracted_data = {"type": detected_doc_type if detected_doc_type != "unknown" else None, "line_items": []}

    extracted_data["type"] = extracted_data.get("type") or (
        detected_doc_type if detected_doc_type != "unknown" else None
    )
    is_correct_type = (
        detected_doc_type in {"po", "invoice", "grn"}
        if expected_doc_type == "auto"
        else detected_doc_type == expected_doc_type
    )
    return {
        "detected_doc_type": detected_doc_type,
        "is_correct_type": is_correct_type,
        "confidence": 1,
        "validation_message": (
            "Che do offline: da tu nhan dien loai chung tu."
            if expected_doc_type == "auto" and is_correct_type
            else "Che do offline: chap nhan theo loai chung tu nguoi dung da chon."
        ),
        "extracted_data": extracted_data,
    }


def _is_xml_upload(filename: str, content_type: str | None) -> bool:
    return filename.lower().endswith(".xml") or (content_type or "").lower() in {"application/xml", "text/xml"}


def _xml_analysis(content: bytes, filename: str, expected_doc_type: str) -> dict[str, Any] | None:
    """XML có cấu trúc nên đọc bằng parser cục bộ: chính xác, nhanh, không tốn phí AI. None nếu không đọc được."""
    try:
        parsed = detect_and_parse_document(content, filename)
    except ValueError:
        return None

    detected_doc_type = parsed.get("type")
    is_correct_type = detected_doc_type in {"po", "invoice", "grn"} and (
        expected_doc_type == "auto" or detected_doc_type == expected_doc_type
    )
    return {
        "detected_doc_type": detected_doc_type,
        "is_correct_type": is_correct_type,
        "confidence": 1,
        "validation_message": "Đã đọc XML bằng parser cục bộ.",
        "extracted_data": parsed,
    }


def _should_use_openai_document_analysis(settings) -> bool:
    if not settings.openai_api_key:
        return False
    return settings.app_env != "test"


def analyze_uploaded_document(
    content: bytes,
    filename: str,
    content_type: str | None,
    expected_doc_type: str,
) -> DocumentAiAnalysis:
    settings = get_settings()
    raw_response: dict[str, Any]
    model_name = settings.openai_document_model
    validate_readable_upload(content, filename, content_type)
    image_quality = _analyze_image_quality(content, filename, content_type)

    xml_response = (
        _xml_analysis(content, filename, expected_doc_type) if _is_xml_upload(filename, content_type) else None
    )

    if xml_response is not None:
        raw_response = xml_response
        model_name = "local-xml-parser"
    elif _should_use_openai_document_analysis(settings):
        try:
            raw_response = _run_openai_analysis(content, filename, content_type, expected_doc_type)
            _correct_misread_line_amounts(raw_response)
        except Exception as exc:
            logger.exception("OpenAI document analysis failed for %s", filename)
            if settings.document_ai_validation_required:
                raise ValueError(
                    f"AI chua doc duoc chung tu. Vui long thu lai hoac kiem tra OPENAI_API_KEY. Chi tiet: {exc}"
                ) from exc
            raw_response = _offline_analysis(content, filename, expected_doc_type)
            raw_response["validation_message"] = (
                f"AI dang tam thoi khong doc duoc file ({exc}), he thong dung che do offline de tiep tuc upload."
            )
            raw_response["fallback_error"] = str(exc)
            model_name = "offline-fallback"
    else:
        raw_response = _offline_analysis(content, filename, expected_doc_type)
        model_name = "offline-fallback"

    detected_doc_type = (raw_response.get("detected_doc_type") or raw_response.get("type") or "").lower().strip()
    if detected_doc_type == "unknown":
        detected_doc_type = None

    extracted_data = raw_response.get("extracted_data") or {}
    if not isinstance(extracted_data, dict):
        extracted_data = {}

    if expected_doc_type == "auto":
        is_correct_type = bool(raw_response.get("is_correct_type")) and detected_doc_type in {"po", "invoice", "grn"}
    else:
        is_correct_type = bool(raw_response.get("is_correct_type")) and detected_doc_type == expected_doc_type
    confidence_value = raw_response.get("confidence")
    confidence = Decimal(str(confidence_value)) if confidence_value is not None else None
    status = "validated" if is_correct_type else "wrong_doc_type"
    validation_message = raw_response.get("validation_message")
    if not validation_message:
        expected_label = DOC_TYPE_LABELS.get(expected_doc_type, expected_doc_type.upper())
        detected_label = DOC_TYPE_LABELS.get(detected_doc_type or "unknown", "Khong xac dinh")
        validation_message = f"File nay co ve la {detected_label}, khong phai {expected_label}."

    if raw_response.get("completeness_warning") and is_correct_type:
        status = "low_quality"
        validation_message = (
            "AI có thể đã đọc thiếu dòng hàng (tổng các dòng nhỏ hơn tổng chứng từ). "
            "Vui lòng kiểm tra lại hoặc tải bản rõ hơn/XML."
        )

    if image_quality:
        raw_response["image_quality"] = image_quality.metrics
        raw_response["is_low_quality_image"] = image_quality.is_low_quality
        if image_quality.is_low_quality and is_correct_type:
            status = "low_quality"
            validation_message = LOW_IMAGE_QUALITY_WARNING
            if confidence is not None:
                confidence = min(confidence, Decimal("0.6500"))

    return DocumentAiAnalysis(
        expected_doc_type=expected_doc_type,
        detected_doc_type=detected_doc_type,
        is_correct_type=is_correct_type,
        confidence=confidence,
        status=status,
        validation_message=validation_message,
        model_name=model_name,
        extracted_data=extracted_data,
        raw_response=raw_response,
    )

import io
import json
import logging
import mimetypes
import re
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from openai import OpenAI

from src.config import get_settings
from src.services.parser_strategies import LocalOcrParserStrategy

DOC_TYPE_LABELS = {
    "po": "Don dat hang (PO)",
    "invoice": "Hoa don (Invoice)",
    "grn": "Phieu nhap kho (GRN)",
}
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
    doc_options = ", ".join(f"{key}={label}" for key, label in DOC_TYPE_LABELS.items())
    return f"""
Ban la AI ke toan doc chung tu mua hang. Hay doc file dinh kem va tra ve JSON theo schema.

Nguoi dung dang upload vao o loai: {expected_doc_type} ({expected_label}).
Ten file: {filename}

Nhiem vu:
1. Tu noi dung file, nhan dien chung tu thuc su thuoc loai nao trong: {doc_options}. Neu khong du bang chung, dung "unknown".
2. Dat is_correct_type=true chi khi loai phat hien trung voi loai nguoi dung da chon.
3. Trich xuat cac truong co trong chung tu de doi soat:
   - So chung tu, ngay chung tu.
   - Nha cung cap, ma so thue, don vi mua neu co.
   - Tong tien, thue VAT neu co.
   - Danh sach hang hoa: SKU/ma hang, ten hang, don vi tinh, so luong, don gia, thue, thanh tien.
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


def _run_openai_analysis(content: bytes, filename: str, content_type: str | None, expected_doc_type: str) -> dict[str, Any]:
    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = _build_prompt(expected_doc_type, filename)
    mime_type = _content_type(filename, content_type)
    suffix = Path(filename).suffix.lower()

    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        import base64

        base64_file = base64.b64encode(content).decode("utf-8")
        response = client.responses.create(
            model=settings.openai_document_model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {
                            "type": "input_image",
                            "image_url": f"data:{mime_type};base64,{base64_file}",
                            "detail": "high",
                        },
                    ],
                }
            ],
            text={"format": {"type": "json_schema", **_json_schema()}},
        )
    else:
        uploaded_file = client.files.create(
            file=(filename, io.BytesIO(content), mime_type),
            purpose="user_data",
        )
        response = client.responses.create(
            model=settings.openai_document_model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_file", "file_id": uploaded_file.id},
                    ],
                }
            ],
            text={"format": {"type": "json_schema", **_json_schema()}},
        )

    return _parse_json_text(_extract_response_text(response))


def _offline_analysis(content: bytes, filename: str, expected_doc_type: str) -> dict[str, Any]:
    try:
        extracted_data = LocalOcrParserStrategy().parse(content, filename, expected_doc_type)
    except Exception:
        extracted_data = {"type": expected_doc_type, "line_items": []}

    extracted_data["type"] = extracted_data.get("type") or expected_doc_type
    return {
        "detected_doc_type": expected_doc_type,
        "is_correct_type": True,
        "confidence": 1,
        "validation_message": "Che do offline: chap nhan theo loai chung tu nguoi dung da chon.",
        "extracted_data": extracted_data,
    }


def analyze_uploaded_document(
    content: bytes,
    filename: str,
    content_type: str | None,
    expected_doc_type: str,
) -> DocumentAiAnalysis:
    settings = get_settings()
    raw_response: dict[str, Any]
    model_name = settings.openai_document_model

    if settings.openai_api_key:
        try:
            raw_response = _run_openai_analysis(content, filename, content_type, expected_doc_type)
        except Exception as exc:
            logger.exception("OpenAI document analysis failed for %s", filename)
            if settings.document_ai_validation_required:
                raise ValueError(f"AI chua doc duoc chung tu. Vui long thu lai hoac kiem tra OPENAI_API_KEY. Chi tiet: {exc}") from exc
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

    is_correct_type = bool(raw_response.get("is_correct_type")) and detected_doc_type == expected_doc_type
    confidence_value = raw_response.get("confidence")
    confidence = Decimal(str(confidence_value)) if confidence_value is not None else None
    status = "validated" if is_correct_type else "wrong_doc_type"
    validation_message = raw_response.get("validation_message")
    if not validation_message:
        expected_label = DOC_TYPE_LABELS.get(expected_doc_type, expected_doc_type.upper())
        detected_label = DOC_TYPE_LABELS.get(detected_doc_type or "unknown", "Khong xac dinh")
        validation_message = f"File nay co ve la {detected_label}, khong phai {expected_label}."

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

from pathlib import Path
from types import SimpleNamespace

import pytest

import src.services.document_ai_extractor as extractor
from src.config import get_settings

RESPONSE_JSON = '{"detected_doc_type": "po", "is_correct_type": true, "confidence": 0.9, "extracted_data": {}}'


class FakeClient:
    """Ghi lại các lời gọi tới OpenAI; không có mạng."""

    def __init__(self):
        self.calls = []
        self.files = SimpleNamespace(create=self._create_file, delete=self._delete_file)
        self.responses = SimpleNamespace(create=self._create_response)

    def _create_file(self, **kwargs):
        self.calls.append(("files.create", kwargs))
        return SimpleNamespace(id="file-123")

    def _delete_file(self, file_id):
        self.calls.append(("files.delete", file_id))

    def _create_response(self, **kwargs):
        self.calls.append(("responses.create", kwargs))
        return SimpleNamespace(output_text=RESPONSE_JSON)

    def names(self):
        return [name for name, _ in self.calls]

    def request(self):
        return next(payload for name, payload in self.calls if name == "responses.create")


@pytest.fixture
def fake_client(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(extractor, "_get_openai_client", lambda api_key, timeout: client)
    return client


def use_settings(monkeypatch, **overrides):
    monkeypatch.setattr(extractor, "get_settings", lambda: get_settings().model_copy(update=overrides))


def test_pdf_is_sent_inline_without_uploading_a_file_first(fake_client, monkeypatch):
    use_settings(monkeypatch)
    extractor._run_openai_analysis(b"%PDF-1.4 test", "po.pdf", "application/pdf", "po")

    assert fake_client.names() == ["responses.create"]
    part = fake_client.request()["input"][0]["content"][1]
    assert part["type"] == "input_file"
    assert part["filename"] == "po.pdf"
    assert part["file_data"].startswith("data:application/pdf;base64,")


def test_other_documents_are_uploaded_then_cleaned_up_even_when_the_call_fails(fake_client, monkeypatch):
    use_settings(monkeypatch)
    extractor._run_openai_analysis(b"docx bytes", "po.docx", "application/octet-stream", "po")
    assert fake_client.names() == ["files.create", "responses.create", "files.delete"]

    failing = FakeClient()
    failing.responses = SimpleNamespace(create=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom")))
    monkeypatch.setattr(extractor, "_get_openai_client", lambda api_key, timeout: failing)
    with pytest.raises(RuntimeError):
        extractor._run_openai_analysis(b"docx bytes", "po.docx", "application/octet-stream", "po")
    assert failing.names() == ["files.create", "files.delete"]


def test_image_detail_and_reasoning_effort_come_from_settings(fake_client, monkeypatch):
    use_settings(monkeypatch, openai_image_detail="low", openai_reasoning_effort="minimal")
    extractor._run_openai_analysis(b"\x89PNG", "scan.png", "image/png", "po")

    request = fake_client.request()
    assert request["input"][0]["content"][1]["detail"] == "low"
    assert request["reasoning"] == {"effort": "minimal"}


def test_default_settings_keep_previous_behaviour(fake_client, monkeypatch):
    use_settings(monkeypatch)
    extractor._run_openai_analysis(b"\x89PNG", "scan.png", "image/png", "po")

    request = fake_client.request()
    assert request["input"][0]["content"][1]["detail"] == "high"
    assert "reasoning" not in request


def test_openai_client_is_reused_and_has_a_timeout():
    extractor._get_openai_client.cache_clear()
    first = extractor._get_openai_client("sk-test", 45.0)
    second = extractor._get_openai_client("sk-test", 45.0)
    assert first is second
    assert first.timeout == 45.0


def extraction(n_lines, total):
    import json

    items = [{"amount": 100_000, "qty": 1, "price": 100_000} for _ in range(n_lines)]
    data = {"total_amount": total, "vat_rate_pct": 10, "line_items": items}
    return json.dumps({"detected_doc_type": "po", "is_correct_type": True, "confidence": 0.9, "extracted_data": data})


def test_incomplete_line_items_trigger_one_retry_and_keep_the_fuller_result(fake_client, monkeypatch):
    use_settings(monkeypatch)
    replies = iter([extraction(5, 72 * 110_000), extraction(72, 72 * 110_000)])
    fake_client.responses = SimpleNamespace(
        create=lambda **kwargs: (
            fake_client.calls.append(("responses.create", kwargs)) or SimpleNamespace(output_text=next(replies))
        )
    )
    result = extractor._run_openai_analysis(b"%PDF-1.4", "po.pdf", "application/pdf", "po")

    assert fake_client.names() == ["responses.create", "responses.create"]
    assert "LAN TRUOC TRICH THIEU" in fake_client.calls[1][1]["input"][0]["content"][0]["text"]
    assert len(result["extracted_data"]["line_items"]) == 72
    assert "completeness_warning" not in result


def test_still_incomplete_after_retry_is_flagged(fake_client, monkeypatch):
    use_settings(monkeypatch)
    fake_client.responses = SimpleNamespace(
        create=lambda **kwargs: (
            fake_client.calls.append(("responses.create", kwargs))
            or SimpleNamespace(output_text=extraction(5, 72 * 110_000))
        )
    )
    result = extractor._run_openai_analysis(b"%PDF-1.4", "po.pdf", "application/pdf", "po")
    assert len(fake_client.names()) == 2
    assert "chi trich 5 dong" in result["completeness_warning"]


@pytest.mark.parametrize(
    ("lines_sum", "total", "short"),
    [
        (1_000_000, 1_100_000, False),  # tổng có VAT 10%
        (1_000_000, 1_000_000, False),  # phiếu nhập kho không thuế
        (500_000, 1_100_000, True),
        (0, 1_100_000, True),
    ],
)
def test_shortfall_compares_lines_with_document_total(lines_sum, total, short):
    items = [{"amount": lines_sum}] if lines_sum else []
    result = extractor._line_items_shortfall({"total_amount": total, "vat_rate_pct": 10, "line_items": items})
    assert (result is not None) == short


def test_misread_line_amount_is_replaced_by_qty_times_price_but_rounding_is_kept():
    result = {
        "extracted_data": {
            "line_items": [
                {"row_index": 55, "qty": 34, "price": 2_680_000, "amount": 91_220_000},  # AI đọc nhầm 1 chữ số
                {"row_index": 56, "qty": 3, "price": 33_333, "amount": 100_000},  # làm tròn 1 đ, giữ nguyên
                {"row_index": 57, "qty": None, "price": 5_000, "amount": 50_000},  # thiếu số lượng, không đoán
            ]
        }
    }
    extractor._correct_misread_line_amounts(result)
    items = result["extracted_data"]["line_items"]
    assert items[0]["amount"] == 91_120_000
    assert items[1]["amount"] == 100_000
    assert items[2]["amount"] == 50_000
    assert result["corrected_line_amounts"] == [{"row_index": 55, "read": 91_220_000, "used": 91_120_000}]


# --- Khi AI không đọc được file: production từ chối kèm lý do, không bao giờ bịa dữ liệu demo ---

MINIMAL_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>
endobj
startxref
0
%%EOF
"""


def fail_openai(monkeypatch, message):
    def boom(*args, **kwargs):
        raise RuntimeError(message)

    monkeypatch.setattr(extractor, "_run_openai_analysis", boom)


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        ("Error code: 429 - {'error': {'code': 'insufficient_quota'}}", "hết hạn mức"),
        ("Error code: 401 - {'error': {'code': 'invalid_api_key'}}", "không hợp lệ"),
        ("Rate limit reached for gpt-4o-mini", "giới hạn số yêu cầu"),
        ("Connection error.", "không kết nối được OpenAI"),
    ],
)
def test_production_refuses_with_a_reason_when_ai_fails(monkeypatch, error, expected):
    use_settings(monkeypatch, app_env="production", openai_api_key="sk-test", document_ai_validation_required=False)
    fail_openai(monkeypatch, error)
    with pytest.raises(ValueError, match=expected):
        extractor.analyze_uploaded_document(MINIMAL_PDF, "po.pdf", "application/pdf", "po")


def test_production_without_api_key_accepts_only_xml(monkeypatch):
    use_settings(monkeypatch, app_env="production", openai_api_key="", document_ai_validation_required=False)
    with pytest.raises(ValueError, match="chỉ nhận chứng từ XML"):
        extractor.analyze_uploaded_document(MINIMAL_PDF, "po.pdf", "application/pdf", "po")


def test_production_still_reads_xml_without_ai(monkeypatch):
    use_settings(monkeypatch, app_env="production", openai_api_key="", document_ai_validation_required=False)
    xml = (Path(__file__).resolve().parents[2] / "dataset" / "xml" / "batch_01_match").glob("*invoice*.xml")
    path = next(iter(sorted(xml)))
    analysis = extractor.analyze_uploaded_document(path.read_bytes(), path.name, "application/xml", "invoice")
    assert analysis.model_name == "local-xml-parser"


def test_development_keeps_the_demo_fallback(monkeypatch):
    use_settings(monkeypatch, app_env="development", openai_api_key="sk-test", document_ai_validation_required=False)
    fail_openai(monkeypatch, "Error code: 429 - insufficient_quota")
    analysis = extractor.analyze_uploaded_document(MINIMAL_PDF, "po.pdf", "application/pdf", "po")
    assert analysis.model_name == "offline-fallback"

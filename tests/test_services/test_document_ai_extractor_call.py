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

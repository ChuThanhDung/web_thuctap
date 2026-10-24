import asyncio
import time
from decimal import Decimal

import pytest

from src.api.auth import get_current_user
from src.main import app
from src.services.document_ai_extractor import DocumentAiAnalysis
from tests.conftest import purge_batch_tables
from tests.test_api.test_uploads import override_get_current_user, valid_pdf_bytes

AI_DELAY_SECONDS = 0.4


def slow_fake_analysis(content, filename, content_type, expected_doc_type):
    """Giả lập một lần đọc chứng từ chậm (blocking như SDK OpenAI đồng bộ), không gọi AI thật."""
    time.sleep(AI_DELAY_SECONDS)
    return DocumentAiAnalysis(
        expected_doc_type=expected_doc_type,
        detected_doc_type=expected_doc_type,
        is_correct_type=True,
        confidence=Decimal("0.9500"),
        status="validated",
        validation_message="ok",
        model_name="test-model",
        extracted_data={"type": expected_doc_type},
        raw_response={"detected_doc_type": expected_doc_type},
    )


@pytest.fixture(autouse=True)
def authenticated_accountant():
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def clean_batches(db_session):
    purge_batch_tables(db_session)
    yield
    purge_batch_tables(db_session)


async def upload(client, batch_id, doc_type):
    return await client.post(
        "/api/v1/uploads",
        data={"doc_type": doc_type, "batch_id": str(batch_id)},
        files={"file": (f"{doc_type}.pdf", valid_pdf_bytes(f"{doc_type} concurrency"), "application/pdf")},
    )


@pytest.mark.asyncio
async def test_slow_extraction_does_not_block_other_requests(client, monkeypatch):
    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", slow_fake_analysis)
    batch = (await client.post("/api/v1/uploads/batches")).json()

    async def timed_health():
        started = time.perf_counter()
        response = await client.get("/health")
        return response.status_code, time.perf_counter() - started

    upload_task = asyncio.create_task(upload(client, batch["id"], "po"))
    await asyncio.sleep(0.05)  # để upload kịp vào bước trích xuất
    status_code, health_seconds = await timed_health()
    upload_response = await upload_task

    assert upload_response.status_code == 200
    assert status_code == 200
    # Trước khi sửa, /health phải chờ hết lần trích xuất (~0,4 s) vì event loop bị chặn.
    assert health_seconds < AI_DELAY_SECONDS / 2


@pytest.mark.asyncio
async def test_three_documents_upload_in_parallel_and_complete_the_batch(client, monkeypatch):
    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", slow_fake_analysis)
    batch = (await client.post("/api/v1/uploads/batches")).json()

    started = time.perf_counter()
    responses = await asyncio.gather(*(upload(client, batch["id"], doc_type) for doc_type in ("po", "invoice", "grn")))
    elapsed = time.perf_counter() - started

    assert [response.status_code for response in responses] == [200, 200, 200]
    # Tuần tự sẽ mất ~3 x 0,4 s; song song gần bằng một lần.
    assert elapsed < AI_DELAY_SECONDS * 2.2

    listed = (await client.get("/api/v1/uploads/batches")).json()["items"]
    saved = next(item for item in listed if item["id"] == batch["id"])
    assert sorted(saved["uploaded_doc_types"]) == ["grn", "invoice", "po"]
    assert saved["missing_doc_types"] == []
    assert saved["status"] == "ready"


@pytest.mark.asyncio
async def test_parallel_duplicate_content_is_still_rejected(client, monkeypatch):
    monkeypatch.setattr("src.api.uploads.analyze_uploaded_document", slow_fake_analysis)
    batch = (await client.post("/api/v1/uploads/batches")).json()

    responses = await asyncio.gather(upload(client, batch["id"], "po"), upload(client, batch["id"], "po"))

    assert sorted(response.status_code for response in responses) == [200, 409]

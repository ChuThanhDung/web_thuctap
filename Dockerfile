FROM python:3.11-slim AS builder

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install -r requirements.txt
COPY requirements-avatar.txt .
RUN pip install --timeout 180 --retries 5 --index-url https://pypi.org/simple -r requirements-avatar.txt

FROM python:3.11-slim

WORKDIR /app

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY --from=builder /opt/venv /opt/venv
COPY src ./src
COPY raw_data ./raw_data
COPY scripts ./scripts

RUN mkdir -p /app/storage/upload /app/storage/avatars /app/invoice && \
    useradd -m appuser && chown -R appuser:appuser /app /opt/venv
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\", \"8000\")}/health')" || exit 1

CMD uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers

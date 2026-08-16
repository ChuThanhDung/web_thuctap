
## Tính năng có trong MVP

- Đăng nhập và phân quyền `accountant` / `chief_accountant`.
- Upload PO, GRN và Invoice theo từng batch.
- Trích xuất và kiểm tra loại chứng từ bằng AI
- Theo dõi batch đã đủ hoặc còn thiếu chứng từ.
- Xem danh sách và chi tiết hồ sơ đối soát, bao gồm từng line item.
- Kế toán trưởng có thể approve, hoặc reject hồ sơ.
- Theo dõi audit log.
- Quản lý hồ sơ cá nhân, người dùng.


## Tech stack

| Layer | Công nghệ |
|---|---|
| Frontend | React 18, Vite 5, React Router, Tailwind CSS, Recharts |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| AI workflow | LangGraph, LangChain, OpenAI API |
| Database | PostgreSQL 16, SQLAlchemy, psycopg |
| Storage | Local filesystem hoặc S3/Cloudflare R2 qua boto3 |
| Testing | pytest, pytest-asyncio, HTTPX |
| Deployment | Docker, Docker Compose, Nginx, Vercel configuration |

## Cấu trúc thư mục

```text
.
├── frontend/               # React + Vite web application
├── src/
│   ├── agents/             # LangGraph state và workflow
│   ├── api/                # FastAPI endpoints
│   ├── models/             # SQLAlchemy models và Pydantic schemas
│   ├── services/           # Auth, parser, AI, reconciliation, storage
│   └── main.py             # FastAPI entry point và database bootstrap
├── tests/                  # API và agent tests
├── dataset/                # Bộ chứng từ mẫu
├── storage/upload/         # File upload khi dùng local storage
├── eval/                   # Evaluation reports/evidence
├── docs/                   # Tài liệu kiến trúc
├── presentation/           # Video demo và tài liệu thuyết trình
└── docker-compose.yml      # PostgreSQL, backend và frontend services
```

## Yêu cầu hệ thống

- Python 3.11 trở lên.
- Node.js 18 trở lên và npm.
- Docker Desktop và Docker Compose (khuyến nghị để chạy PostgreSQL).
- OpenAI API key nếu bật bắt buộc AI validation.

## Cài đặt và chạy local

### 1. Clone và cấu hình môi trường

```bash
git clone https://github.com/AI20K-Build-Phase-Cohort-3/P-007.git
cd P-007
cp .env.example .env
```

Trên PowerShell, dùng:

```powershell
Copy-Item .env.example .env
```

Kiểm tra `.env` trước khi chạy. Không commit API key hoặc thông tin đăng nhập thật.

### 2. Khởi động PostgreSQL

```bash
docker compose up -d postgres
```

Database mặc định chạy tại `localhost:5433`, tên database `docusyncai`.

### 3. Khởi động backend

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

macOS/Linux:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Backend tự tạo/cập nhật các bảng và seed tài khoản demo khi khởi động.

- Health check: <http://127.0.0.1:8000/health>
- Swagger UI: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

### 4. Khởi động frontend

Mở terminal thứ hai:

```bash
cd frontend
npm install
npm run dev
```

Ứng dụng chạy tại <http://localhost:3000>.

## Chạy toàn bộ bằng Docker

```bash
docker compose up --build
```

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000>
- PostgreSQL: `localhost:5433`

Dừng services:

```bash
docker compose down
```

## Demo

Demo: <https://docusyncai-frontend.vercel.app/login>
- Kế toán viên: `accountant@docusync.ai`
- Kế toán trưởng: `chief.accountant@docusync.ai`
- Mật khẩu: `123456`


### Sample request: đăng nhập

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"accountant@docusync.ai","password":"123456"}'
```

Response trả về `access_token`, `token_type` và thông tin user. Dùng token cho các request tiếp theo:

```bash
curl http://127.0.0.1:8000/api/v1/uploads/batches \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Sample request: upload chứng từ

`doc_type` nhận một trong ba giá trị: `po`, `grn`, `invoice`.

```bash
curl -X POST http://127.0.0.1:8000/api/v1/uploads \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "doc_type=invoice" \
  -F "batch_id=<BATCH_ID>" \
  -F "file=@dataset/02/03_invoice.docx"
```

## Chạy test và kiểm tra chất lượng

```bash
pytest tests -v
ruff check src tests
```

Build frontend để kiểm tra trước khi merge/deploy:

```bash
cd frontend
npm run build
```
## Environment variables

Danh sách đầy đủ và giá trị mẫu nằm trong [`.env.example`](.env.example).

| Biến | Bắt buộc | Mô tả |
|---|:---:|---|
| `APP_ENV` | Có | Môi trường: `development`, `production` hoặc `test` |
| `APP_HOST`, `APP_PORT` | Có | Host và port của backend |
| `CORS_ORIGINS` | Có | Danh sách frontend origins, phân cách bằng dấu phẩy |
| `DATABASE_URL` | Có | PostgreSQL URL khi chạy backend local |
| `DOCKER_DATABASE_URL` | Docker | PostgreSQL URL nội bộ Docker Compose |
| `OPENAI_API_KEY` | Tùy chế độ | API key dùng cho LLM và document extraction |
| `MODEL_NAME` | Không | Model cho agent/chat; mặc định `gpt-4o-mini` |
| `OPENAI_DOCUMENT_MODEL` | Không | Model dùng để phân tích chứng từ |
| `DOCUMENT_AI_VALIDATION_REQUIRED` | Không | `true` để từ chối upload khi AI không phân tích được |
| `STORAGE_PROVIDER` | Có | `local`, `r2` hoặc `s3` |
| `STORAGE_BUCKET` | Cloud storage | Tên bucket |
| `STORAGE_ENDPOINT_URL` | R2/S3 custom | Endpoint của object storage |
| `STORAGE_ACCESS_KEY_ID` | Cloud storage | Access key, không commit giá trị thật |
| `STORAGE_SECRET_ACCESS_KEY` | Cloud storage | Secret key, không commit giá trị thật |
| `VITE_API_BASE_URL` | Frontend | API base URL; Docker mặc định `/api/v1` |
| `SMTP_HOST`, `SMTP_PORT` | OTP email | SMTP server và port |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | OTP email | Thông tin gửi OTP |
| `LANGCHAIN_API_KEY` | Không | LangSmith tracing key |
| `LANGCHAIN_PROJECT` | Không | Tên project trên LangSmith |
| `LANGCHAIN_TRACING_V2` | Không | Bật/tắt LangSmith tracing |

Với local storage, file được lưu dưới `storage/upload/{doc_type}/`. Với R2/S3, cần cấu hình đầy đủ bucket và credentials.

## API chính

Tất cả endpoint nghiệp vụ dùng prefix `/api/v1`. Ngoại trừ login và health check, các endpoint cần bearer token.

| Method | Endpoint | Chức năng |
|---|---|---|
| `GET` | `/health` | Kiểm tra backend |
| `POST` | `/api/v1/auth/login` | Đăng nhập |
| `GET/PATCH` | `/api/v1/auth/me` | Xem/cập nhật hồ sơ |
| `POST` | `/api/v1/uploads/batches` | Tạo document batch |
| `GET` | `/api/v1/uploads/batches` | Danh sách batch |
| `POST` | `/api/v1/uploads` | Upload PO/GRN/Invoice |
| `GET` | `/api/v1/uploads` | Danh sách file đã upload |
| `GET` | `/api/v1/reconciliations` | Danh sách hồ sơ đối soát |
| `GET` | `/api/v1/reconciliations/{case_id}` | Chi tiết hồ sơ |
| `POST` | `/api/v1/reconciliations/{case_id}/decide` | Approve/reject/escalate |
| `GET` | `/api/v1/reconciliations/stats` | Thống kê cho kế toán trưởng |
| `GET` | `/api/v1/audit-logs` | Audit trail |
| `GET/PUT` | `/api/v1/thresholds` | Xem/cập nhật ngưỡng đối soát |

## Team

| Thành viên | Vai trò |
|---|---|
| Chu Thành Dũng | Trưởng nhóm |
| Nguyễn Trung Đức | Thành viên |
| Nguyễn Văn Quý | Thành viên |
| Trần Lương Hoàng Anh | Thành viên |



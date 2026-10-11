# DocuSyncAI

DocuSyncAI là hệ thống quản lý chứng từ và đối soát ba bên giữa đơn đặt hàng (PO), phiếu nhập kho (GRN) và hóa đơn (Invoice), có hỗ trợ AI trong quá trình trích xuất và kiểm tra dữ liệu.

## Live demo

Demo: <https://c3-app-007.docusyncai.asia/>

Tài khoản demo được cấp riêng cho từng người đánh giá; liên hệ nhóm phát triển để nhận thông tin đăng nhập.

## Tech stack

| Layer | Công nghệ |
|---|---|
| Frontend | React 18, Vite 5, React Router, Tailwind CSS, Recharts |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| AI | OpenAI API và Google Gemini (`google-genai`) cho PDF và ảnh; LangGraph cho agent mẫu |
| Database | PostgreSQL 16, quản lý schema bằng Alembic |
| Storage | Local, Cloudflare R2 hoặc S3 |
| Testing | pytest, pytest-asyncio, HTTPX, pytest-cov; Vitest cho frontend |
| Deployment | Docker, Docker Compose, Nginx, Caddy (HTTPS tùy chọn), GitHub Actions CI |

## Cấu trúc thư mục

```text
.
├── frontend/               # React + Vite web application
├── src/
│   ├── agents/             # LangGraph state và workflow
│   ├── api/                # FastAPI endpoints
│   ├── models/             # SQLAlchemy models và Pydantic schemas
│   ├── services/           # Auth, parser, AI, reconciliation, storage
│   └── main.py             # FastAPI entry point, seed dữ liệu ban đầu, middleware
├── migrations/             # Alembic: mỗi thay đổi schema là một revision
├── tests/                  # Backend tests (API, service, migration, bảo mật)
├── dataset/                # Bộ chứng từ mẫu
├── storage/upload/         # File upload khi dùng local storage
├── eval/                   # Báo cáo đánh giá và script đo (run_eval.py, measure_api_latency.py)
├── scripts/                # Backup/restore DB, reset mật khẩu, kiểm tra SMTP
├── deploy/                 # Caddyfile cho HTTPS
├── docs/                   # Tài liệu bổ sung
├── presentation/           # Video demo và tài liệu thuyết trình
├── docker-compose.yml          # Cấu hình production-safe
└── docker-compose.override.yml # Tiện ích dev, tự nạp khi chạy `docker compose up`
```

Xem thêm [ARCHITECTURE.md](ARCHITECTURE.md) (kiến trúc, luồng nghiệp vụ, bảo mật) và [DEPLOYMENT.md](DEPLOYMENT.md) (triển khai production, HTTPS, sao lưu).

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

Kiểm tra `.env` trước khi chạy: thay `<PASSWORD>` bằng mật khẩu thật cho `POSTGRES_PASSWORD`, `DATABASE_URL` và `DOCKER_DATABASE_URL`. Không commit API key hoặc thông tin đăng nhập thật.

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
python -m pip install -r requirements-dev.txt
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

macOS/Linux:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Khi khởi động, backend chạy `alembic upgrade head` và tạo hai tài khoản ban đầu (`accountant@docusync.ai`, `chief.accountant@docusync.ai`). Mật khẩu lấy từ `SEED_DEFAULT_PASSWORD`; nếu để trống, hệ thống sinh mật khẩu ngẫu nhiên và ghi vào log đúng một lần.

- Health check: <http://127.0.0.1:8000/health> (liveness) và <http://127.0.0.1:8000/health/ready> (kèm kiểm tra database)
- Swagger UI: <http://127.0.0.1:8000/docs> (chỉ bật ngoài production)
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json> (chỉ bật ngoài production)

### 4. Khởi động frontend

Mở terminal thứ hai:

```bash
cd frontend
npm install
npm run dev
```

Ứng dụng chạy tại <http://localhost:3000>.

## Chạy toàn bộ bằng Docker

Môi trường dev (nạp `docker-compose.override.yml`, có dữ liệu demo):

```bash
docker compose up -d --build
```

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000> (đổi bằng `BACKEND_PORT`)
- PostgreSQL: `127.0.0.1:5433`

Production (không mount mã nguồn, không mở cổng backend và DB, không dữ liệu demo):

```bash
docker compose -f docker-compose.yml up -d --build
```

Hướng dẫn đầy đủ gồm HTTPS, sao lưu và danh sách kiểm tra: [DEPLOYMENT.md](DEPLOYMENT.md).

Dừng services:

```bash
docker compose down
```

### Sample request: đăng nhập

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"accountant@docusync.ai","password":"<mật khẩu seed>"}'
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
pytest tests -v --cov=src          # cần PostgreSQL đang chạy và DATABASE_URL hợp lệ
ruff check src tests migrations scripts eval
python eval/run_eval.py            # đánh giá pipeline XML trên dataset
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

Test backend tự chạy trên database riêng `<tên database>_test` (tự tạo nếu chưa có) và thư mục lưu file tạm, nên không bao giờ làm mất dữ liệu đang dùng.

CI (GitHub Actions) chạy lint, migration, test backend với ngưỡng độ phủ 75%, đánh giá dataset, test và build frontend, và kiểm tra cấu hình Compose. Số liệu đánh giá mới nhất: [eval/results/report.md](eval/results/report.md).

## Environment variables

Danh sách đầy đủ và giá trị mẫu nằm trong [`.env.example`](.env.example).

| Biến | Bắt buộc | Mô tả |
|---|:---:|---|
| `APP_ENV` | Có | Môi trường: `development`, `production` hoặc `test` |
| `APP_HOST`, `APP_PORT` | Có | Host và port của backend |
| `CORS_ORIGINS` | Có | Danh sách frontend origins, phân cách bằng dấu phẩy |
| `DATABASE_URL` | Có | PostgreSQL URL khi chạy backend local |
| `DOCKER_DATABASE_URL` | Docker | PostgreSQL URL nội bộ Docker Compose |
| `POSTGRES_PASSWORD` | Docker | Mật khẩu PostgreSQL; bắt buộc, không có giá trị mặc định |
| `SEED_DEFAULT_PASSWORD` | Không | Mật khẩu tài khoản ban đầu; để trống để sinh ngẫu nhiên (production yêu cầu từ 10 ký tự) |
| `SEED_DEFAULT_USERS` | Không | `false` để không tạo tài khoản ban đầu |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | Không | Giới hạn đăng nhập sai (mặc định 5 lần trong 15 phút) |
| `MAX_UPLOAD_BYTES` | Không | Dung lượng tối đa mỗi file upload (mặc định 20 MB) |
| `RUN_MIGRATIONS_ON_STARTUP` | Không | `false` để chạy `alembic upgrade head` như bước deploy riêng |
| `LOG_LEVEL`, `LOG_FORMAT` | Không | Mức log và định dạng `text` hoặc `json` |
| `DOCS_ENABLED_IN_PRODUCTION` | Không | `true` để bật Swagger ở production (mặc định tắt) |
| `ENABLE_AGENT_CHAT_API` | Không | Bật endpoint agent mẫu `/api/v1/chat` (mặc định tắt) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Không | Bóc tách PDF và ảnh bằng Gemini |
| `DOMAIN` | HTTPS | Domain cho profile `https` (Caddy) |
| `OPENAI_API_KEY` | Tùy chế độ | API key dùng cho LLM và document extraction |
| `MODEL_NAME` | Không | Model cho agent/chat; giá trị mẫu trong `.env.example` là `gpt-5.6-sol` |
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

Các endpoint nghiệp vụ dùng prefix `/api/v1`. Phần lớn endpoint yêu cầu bearer token; các ngoại lệ công khai gồm đăng nhập, health check và đường dẫn phục vụ ảnh đại diện.

| Method | Endpoint | Chức năng |
|---|---|---|
| `GET` | `/health` | Kiểm tra backend (liveness) |
| `GET` | `/health/ready` | Kiểm tra backend và database (readiness) |
| `POST` | `/api/v1/auth/login` | Đăng nhập |
| `GET/PATCH` | `/api/v1/auth/me` | Xem/cập nhật hồ sơ |
| `POST` | `/api/v1/uploads/batches` | Tạo document batch |
| `GET` | `/api/v1/uploads/batches` | Danh sách batch |
| `PATCH` | `/api/v1/uploads/batches/{batch_id}` | Cập nhật document batch |
| `POST` | `/api/v1/uploads/batches/{batch_id}/approve` | Duyệt batch |
| `POST` | `/api/v1/uploads/batches/{batch_id}/final-approve` | Duyệt batch lần cuối |
| `POST` | `/api/v1/uploads/batches/{batch_id}/reject` | Từ chối batch |
| `POST` | `/api/v1/uploads` | Upload PO/GRN/Invoice |
| `GET` | `/api/v1/uploads` | Danh sách file đã upload |
| `GET` | `/api/v1/reconciliations` | Danh sách hồ sơ đối soát |
| `GET` | `/api/v1/reconciliations/{case_id}` | Chi tiết hồ sơ |
| `POST` | `/api/v1/reconciliations/{case_id}/decide` | Approve/reject/escalate |
| `GET` | `/api/v1/reconciliations/stats` | Thống kê cho kế toán trưởng |
| `GET` | `/api/v1/audit-logs` | Audit trail |
| `GET/POST` | `/api/v1/thresholds` | Xem/tạo ngưỡng đối soát |
| `PUT/DELETE` | `/api/v1/thresholds/{threshold_id}` | Cập nhật/xóa ngưỡng đối soát |
| `GET` | `/api/v1/notifications` | Danh sách thông báo |
| `POST` | `/api/v1/notifications/read-all` | Đánh dấu tất cả thông báo đã đọc |
| `GET/POST` | `/api/v1/auth/users` | Danh sách/tạo người dùng |
| `PATCH/DELETE` | `/api/v1/auth/users/{user_id}` | Cập nhật/xóa người dùng |

## Team

| Thành viên | Vai trò | Công việc |
|---|---|---|
| Chu Thành Dũng | Trưởng nhóm | Developer |
| Nguyễn Trung Đức | Thành viên | BA |
| Nguyễn Văn Quý | Thành viên | Developer |
| Trần Lương Hoàng Anh | Thành viên | QA / Tester |

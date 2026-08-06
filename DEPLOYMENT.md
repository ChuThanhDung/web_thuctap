# Deploy DocuSyncAI bằng Docker Compose

## 1. Chuẩn bị biến môi trường

Tạo file `.env` từ `.env.example`, sau đó cập nhật các giá trị thật:

```powershell
Copy-Item .env.example .env
```
        
Các biến quan trọng:

```env
POSTGRES_USER=admin
POSTGRES_PASSWORD=Admin@123
POSTGRES_DB=docusyncai
DATABASE_URL=postgresql+psycopg://admin:Admin%40123@localhost:5432/docusyncai
DOCKER_DATABASE_URL=postgresql+psycopg://admin:Admin%40123@postgres:5432/docusyncai
FRONTEND_PORT=3000
BACKEND_PORT=8000
```

Nếu mật khẩu database có ký tự đặc biệt, giá trị trong `DATABASE_URL` và `DOCKER_DATABASE_URL` cần được URL encode. Ví dụ `@` thành `%40`.

## 2. Chạy toàn bộ hệ thống

```powershell
docker compose up --build
```

Sau khi chạy thành công:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:8000/health`
- API login: `http://localhost:3000/api/v1/auth/login`

## 3. Database seed mặc định

Khi Postgres volume được tạo lần đầu, Docker sẽ tự chạy:

```text
scripts/init_auth.sql
```

Tài khoản mẫu:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Kế toán viên | `accountant@docusync.ai` | `123456` |
| Kế toán trưởng | `chief.accountant@docusync.ai` | `123456` |

Nếu database volume đã tồn tại từ trước, file init sẽ không tự chạy lại. Khi muốn reset dữ liệu dev:

```powershell
docker compose down -v
docker compose up --build
```

## 4. Chạy riêng từng phần khi phát triển

Backend:

```powershell
.\.venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

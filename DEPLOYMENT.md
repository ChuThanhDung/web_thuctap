# Chạy DocuSyncAI local, không chạy app qua Docker

Docker Compose hiện chỉ dùng để bật PostgreSQL cho môi trường dev. Backend và frontend chạy trực tiếp từ source local để mọi thay đổi code có hiệu lực ngay.

## 1. Bật database

```powershell
docker compose up -d postgres
```

Database local:

```env
DATABASE_URL=postgresql+psycopg://admin:Admin%40123@localhost:5433/docusyncai
```

## 2. Chạy backend local

```powershell
.\.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Backend health check:

```text
http://127.0.0.1:8000/health
```

## 3. Chạy frontend local

```powershell
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:3000
```

## 4. Dừng app Docker cũ nếu còn chạy

Nếu trước đó đã chạy full stack bằng Docker, dừng container backend/frontend cũ:

```powershell
docker compose down
docker compose up -d postgres
```

Sau đó chỉ mở backend/frontend bằng lệnh local ở trên.

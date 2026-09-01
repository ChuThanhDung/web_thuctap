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

Email thông báo reject batch sẽ tự lấy frontend origin từ trình duyệt khi thao tác trên web. Khi deploy backend riêng với frontend, nên cấu hình thêm:

```env
APP_FRONTEND_URL=https://docusyncai-frontend.vercel.app
```

Nếu dùng domain frontend khác, thay bằng domain thật để nút "Mở batch bị từ chối" trong email trỏ đúng website.

### Kiểm tra email reject batch trên server

Nếu local gửi email được nhưng server không nhận mail khi kế toán trưởng từ chối batch, kiểm tra các biến môi trường trên backend server:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail gửi mail>
SMTP_PASSWORD=<gmail app password>
SMTP_FROM=<gmail gửi mail>
SMTP_TLS=true
APP_FRONTEND_URL=<domain frontend production>
```

Chạy script chẩn đoán ngay trong môi trường server/backend:

```bash
python scripts/check_smtp_email.py
python scripts/check_smtp_email.py --to accountant@example.com
```

Kết quả cần chú ý:

- `is_smtp_configured: False`: server thiếu `SMTP_USER` hoặc `SMTP_PASSWORD`.
- `TCP connect` lỗi: server không mở được kết nối tới SMTP host/port, thường do firewall hoặc hosting chặn SMTP outbound.
- `Test email sent: False`: đã kết nối được nhưng SMTP login/send bị từ chối; kiểm tra Gmail app password, `SMTP_USER`, `SMTP_FROM` và bảo mật tài khoản gửi.

Trong Nhật ký thao tác, action `DOCUMENT_BATCH_REJECTED` có `notification_email_status` để biết email đã được queue hay bị bỏ qua vì thiếu cấu hình.

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

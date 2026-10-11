# Triển khai và vận hành DocuSyncAI

Có hai cách chạy: **dev** (nhanh, có dữ liệu demo) và **production** (an toàn, không dữ liệu demo). Cả hai dùng chung `docker-compose.yml`; dev nạp thêm `docker-compose.override.yml`.

| | Dev | Production |
|---|---|---|
| Lệnh | `docker compose up -d --build` | `docker compose -f docker-compose.yml up -d --build` |
| Mã nguồn | Mount `./src` vào container | Đóng gói trong image |
| Cổng backend, DB | Mở (`BACKEND_PORT`, DB bind `127.0.0.1`) | Không mở ra ngoài |
| Dữ liệu demo | Nạp từ `scripts/002_seed_data.sql` khi volume trống | Không nạp |
| File upload | Thư mục `./storage`, `./invoice` | Docker volume |
| Swagger `/docs` | Bật | Tắt |

> Luôn chỉ định `-f docker-compose.yml` khi chạy production, vì Compose tự nạp `docker-compose.override.yml` nếu không có `-f`.

## 1. Chuẩn bị môi trường

```bash
cp .env.example .env
```

Các biến **bắt buộc** phải đặt trước khi chạy Compose:

| Biến | Ghi chú |
|---|---|
| `POSTGRES_PASSWORD` | Mật khẩu mạnh, không dùng `Admin@123` |
| `DOCKER_DATABASE_URL` | `postgresql+psycopg://admin:<mật khẩu đã URL-encode>@postgres:5432/docusyncai` |
| `APP_ENV=production` | Bật kiểm tra cấu hình an toàn (từ chối mật khẩu DB mặc định, mật khẩu seed yếu) |
| `CORS_ORIGINS` | Origin của frontend, ví dụ `https://app.example.com` |
| `APP_FRONTEND_URL` | URL frontend dùng trong email từ chối batch |

Khuyến nghị cho production: `LOG_FORMAT=json`, `SEED_DEFAULT_PASSWORD` (tối thiểu 10 ký tự) hoặc để trống để hệ thống sinh mật khẩu ngẫu nhiên và ghi vào log một lần, `DOCKER_DATABASE_URL` khớp `POSTGRES_PASSWORD`.

Backend từ chối khởi động ở production nếu `DATABASE_URL` còn mật khẩu mặc định hoặc `SEED_DEFAULT_PASSWORD` yếu.

## 2. Chạy production

```bash
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml ps
```

Lần đầu, DB trống nên backend tự chạy migration và tạo hai tài khoản ban đầu (`accountant@docusync.ai`, `chief.accountant@docusync.ai`). Lấy mật khẩu sinh ngẫu nhiên từ log:

```bash
docker compose -f docker-compose.yml logs backend | grep "mật khẩu ngẫu nhiên"
```

Đổi mật khẩu ngay sau lần đăng nhập đầu, hoặc đặt bằng script:

```bash
docker compose -f docker-compose.yml exec backend python scripts/reset_password.py <email>
```

Muốn không tạo tài khoản seed (khi đã có người dùng thật): `SEED_DEFAULT_USERS=false`.

### HTTPS

Đặt domain đã trỏ về server vào `.env`, rồi bật profile `https` (Caddy tự xin và gia hạn chứng chỉ Let's Encrypt):

```env
DOMAIN=app.example.com
FRONTEND_BIND=127.0.0.1
CORS_ORIGINS=https://app.example.com
APP_FRONTEND_URL=https://app.example.com
```

```bash
docker compose -f docker-compose.yml --profile https up -d --build
```

Mở cổng 80 và 443 trên firewall. `FRONTEND_BIND=127.0.0.1` để chỉ Caddy truy cập được frontend.

## 3. Kiểm tra sức khỏe

| Endpoint | Ý nghĩa |
|---|---|
| `/health` | Tiến trình còn sống (liveness) |
| `/health/ready` | Kết nối được tới database (trả 503 nếu DB lỗi) |

Healthcheck của Compose dùng `/health/ready`. Mọi phản hồi có header `X-Request-ID`; với `LOG_FORMAT=json`, mỗi dòng log là một JSON kèm `request_id`, `method`, `path`, `status`, `duration_ms` để gom vào hệ thống log tập trung.

## 4. Migration cơ sở dữ liệu

Backend tự chạy `alembic upgrade head` khi khởi động. Để tách thành bước deploy riêng:

```env
RUN_MIGRATIONS_ON_STARTUP=false
```

```bash
docker compose -f docker-compose.yml run --rm backend alembic upgrade head
```

Tạo migration mới khi đổi model: `alembic revision -m "mo ta thay doi"`, viết `upgrade()` bằng thao tác `op.*`, và thêm test. Không thêm DDL vào `src/schema_bootstrap.py` (chỉ dành cho baseline).

## 5. Sao lưu và khôi phục

**Hãy sao lưu trước khi nâng cấp hoặc chạy migration.** Bộ chứng từ đã duyệt cuối được trigger database bảo vệ khỏi bị xóa, nhưng sao lưu vẫn là biện pháp duy nhất khi mất ổ đĩa hoặc xóa nhầm cả database.

Sao lưu database (định dạng `pg_dump -Fc`) và thư mục file upload, giữ 14 ngày:

```bash
scripts/backup_db.sh                # production
COMPOSE_ARGS="" scripts/backup_db.sh  # dev
```

Biến tùy chọn: `BACKUP_DIR` (mặc định `./backups`), `KEEP_DAYS`. Script kiểm tra bản dump đọc được trước khi báo thành công.

Lên lịch hằng ngày bằng cron (Linux):

```cron
0 2 * * * cd /opt/docusyncai && BACKUP_DIR=/var/backups/docusyncai scripts/backup_db.sh >> /var/log/docusyncai-backup.log 2>&1
```

Khôi phục (ghi đè dữ liệu hiện tại, bắt buộc có `--yes`):

```bash
scripts/restore_db.sh backups/db_YYYYMMDD_HHMMSS.dump --yes
docker compose -f docker-compose.yml restart backend
```

Giải nén file upload khi cần: `tar xzf backups/storage_YYYYMMDD_HHMMSS.tar.gz` rồi chép vào volume `storage_data` và `invoice_data`. Nên copy thư mục `backups/` sang nơi lưu khác (object storage hoặc máy khác); sao lưu cùng ổ đĩa với server không bảo vệ được khi mất ổ đĩa. Nên thử khôi phục định kỳ vào một database tạm.

## 6. Chạy dev không qua Docker cho backend và frontend

Docker chỉ chạy PostgreSQL, backend và frontend chạy từ mã nguồn để thay đổi có hiệu lực ngay.

```powershell
docker compose up -d postgres
```

`.env` cần có:

```env
DATABASE_URL=postgresql+psycopg://admin:<PASSWORD>@localhost:5433/docusyncai
```

Backend:

```powershell
.\.venv\Scripts\activate
python -m pip install -r requirements-dev.txt
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Frontend chạy tại `http://localhost:3000`. Nếu trước đó đã chạy full stack bằng Docker, dừng container cũ trước (`docker compose down`, rồi `docker compose up -d postgres`).

## 7. Email thông báo từ chối batch

Email lấy frontend origin từ trình duyệt khi thao tác trên web. Khi deploy backend tách riêng frontend, đặt `APP_FRONTEND_URL` là domain thật để nút "Mở batch bị từ chối" trong email trỏ đúng website.

Biến SMTP cần có trên server:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail gửi mail>
SMTP_PASSWORD=<gmail app password>
SMTP_FROM=<gmail gửi mail>
SMTP_TLS=true
APP_FRONTEND_URL=<domain frontend production>
```

Chẩn đoán ngay trong môi trường backend:

```bash
python scripts/check_smtp_email.py
python scripts/check_smtp_email.py --to accountant@example.com
```

- `is_smtp_configured: False`: thiếu `SMTP_USER` hoặc `SMTP_PASSWORD`.
- `TCP connect` lỗi: server không mở được kết nối tới SMTP host/port, thường do firewall hoặc hosting chặn SMTP outbound.
- `Test email sent: False`: đã kết nối nhưng đăng nhập hoặc gửi bị từ chối; kiểm tra Gmail app password, `SMTP_USER`, `SMTP_FROM`.

Trong Nhật ký thao tác, action `DOCUMENT_BATCH_REJECTED` có `notification_email_status` cho biết email đã được xếp hàng hay bị bỏ qua vì thiếu cấu hình.

## 8. Danh sách kiểm tra trước khi đưa cho đối tác

- [ ] `APP_ENV=production`, mật khẩu DB và mật khẩu seed đã đổi, backend khởi động thành công.
- [ ] Đã đổi mật khẩu các tài khoản ban đầu; không còn tài khoản dùng mật khẩu mặc định.
- [ ] HTTPS hoạt động; cổng backend và DB không truy cập được từ ngoài.
- [ ] `/health/ready` trả 200; healthcheck các container đều `healthy`.
- [ ] Đã chạy `scripts/backup_db.sh` thành công và thử khôi phục vào DB tạm.
- [ ] Đã cấu hình SMTP và gửi thử email từ chối batch.
- [ ] Đã điền `OPENAI_API_KEY` hoặc `GEMINI_API_KEY` nếu cần bóc tách PDF và ảnh.
- [ ] Đã xem [eval/results/report.md](eval/results/report.md) để nắm rõ phần nào đã và chưa được đo.

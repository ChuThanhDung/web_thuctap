# Triển khai DocuSyncAI lên Google Cloud (1 máy ảo + Docker Compose)

Một máy ảo Compute Engine **e2-medium** (2 vCPU, 4 GB RAM) ở Singapore chạy nguyên `docker-compose.yml` của repo:
Postgres, backend, frontend và Caddy (HTTPS tự động). Không phải sửa code. Bản sao lưu đẩy lên Cloud Storage.

Chi phí ước tính (trừ vào credit 300 USD của Free Trial, kiểm tra lại trên trang giá của Google):

| Hạng mục | Ước tính/tháng |
|---|---|
| e2-medium, asia-southeast1 | ~30 USD |
| Ổ đĩa 30 GB pd-balanced | ~3 USD |
| IP tĩnh (đang gắn máy) | ~3–4 USD |
| Cloud Storage cho backup, mạng ra | < 2 USD |
| **Tổng** | **~38 USD**, credit dùng được trọn 90 ngày của Free Trial |

Hết 90 ngày hoặc hết credit, Google không tự trừ tiền mà tạm dừng tài nguyên. Muốn chạy tiếp thì nâng lên tài khoản
trả phí (Upgrade) trước khi hết hạn. Xem mục [Khi gần hết Free Trial](#khi-gần-hết-free-trial).

Mọi lệnh `gcloud` dưới đây chạy trong **Cloud Shell** (biểu tượng `>_` trên console.cloud.google.com), không cần
cài gì trên máy cá nhân.

## 1. Tạo project và đặt cảnh báo ngân sách

1. Đăng ký Free Trial tại https://cloud.google.com/free (cần thẻ Visa/Mastercard để xác minh, không bị trừ tiền).
2. Tạo project, ví dụ `docusyncai-prod`.
3. **Billing → Budgets & alerts → Create budget**: 300 USD, cảnh báo ở 50%, 90%, 100%.

```bash
gcloud config set project docusyncai-prod
gcloud config set compute/region asia-southeast1
gcloud config set compute/zone asia-southeast1-b
gcloud services enable compute.googleapis.com storage.googleapis.com
```

## 2. IP tĩnh, tường lửa, máy ảo

```bash
gcloud compute addresses create docusyncai-ip --region asia-southeast1
gcloud compute addresses describe docusyncai-ip --region asia-southeast1 --format='value(address)'   # ghi lại IP

gcloud compute firewall-rules create allow-web --allow tcp:80,tcp:443 --target-tags web

gcloud compute instances create docusyncai \
  --machine-type e2-medium \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-balanced \
  --address docusyncai-ip --tags web \
  --scopes https://www.googleapis.com/auth/devstorage.read_write,https://www.googleapis.com/auth/logging.write
```

Chỉ mở 80 và 443. SSH (22) đã có sẵn trong rule mặc định của GCP; Postgres và backend không mở ra ngoài.

## 3. Tên miền

Chọn một trong hai:

- **Có tên miền riêng**: tạo bản ghi `A` trỏ `app.tenmien.vn` về IP tĩnh ở bước 2.
- **Chưa có tên miền** (demo): dùng `sslip.io`, ví dụ IP `34.87.10.20` thành `34-87-10-20.sslip.io`. Caddy vẫn xin được
  chứng chỉ HTTPS thật.

## 4. Cài máy ảo và mã nguồn

```bash
gcloud compute ssh docusyncai
```

Trong máy ảo:

```bash
git clone https://github.com/ChuThanhDung/web_thuctap.git /tmp/src
sudo bash /tmp/src/deploy/gcp/setup-vm.sh
exit                      # đăng xuất để nhận quyền docker
```

SSH lại rồi clone vào thư mục chạy chính. Repo private thì tạo **fine-grained token** (GitHub → Settings → Developer
settings, quyền Contents: Read-only cho đúng repo này) và dùng làm mật khẩu khi `git clone` hỏi.

```bash
gcloud compute ssh docusyncai          # (chạy từ Cloud Shell)
git clone https://github.com/ChuThanhDung/web_thuctap.git /opt/docusyncai
cd /opt/docusyncai
git config credential.helper store     # nhớ token cho các lần update sau
```

## 5. Tạo `.env` và chạy

```bash
cp .env.example .env
openssl rand -hex 24      # chạy 2 lần: một cho POSTGRES_PASSWORD, một cho SEED_DEFAULT_PASSWORD
nano .env
```

Các biến phải sửa (thay `app.tenmien.vn` bằng tên miền ở bước 3):

```env
APP_ENV=production
LOG_FORMAT=json
DOMAIN=app.tenmien.vn
FRONTEND_BIND=127.0.0.1
CORS_ORIGINS=https://app.tenmien.vn
APP_FRONTEND_URL=https://app.tenmien.vn
POSTGRES_PASSWORD=<chuỗi hex thứ nhất>
DOCKER_DATABASE_URL=postgresql+psycopg://admin:<chuỗi hex thứ nhất>@postgres:5432/docusyncai
SEED_DEFAULT_PASSWORD=<chuỗi hex thứ hai>
OPENAI_API_KEY=<khóa OpenAI>
OPENAI_DOCUMENT_MODEL=gpt-4o-mini
```

Thêm cấu hình SMTP nếu cần email từ chối batch. Chuỗi hex không có ký tự đặc biệt nên không phải URL-encode.

```bash
chmod 600 .env
docker compose -f docker-compose.yml --profile https up -d --build     # lần đầu build khoảng 5–10 phút
docker compose -f docker-compose.yml ps
```

Mở `https://app.tenmien.vn`, đăng nhập `chief.accountant@docusync.ai` / `accountant@docusync.ai` bằng
`SEED_DEFAULT_PASSWORD`, rồi **đổi mật khẩu ngay**. Thêm người dùng thật xong thì đặt `SEED_DEFAULT_USERS=false`.

## 6. Sao lưu tự động lên Cloud Storage

Trong Cloud Shell, tạo bucket cùng khu vực, tự xóa bản cũ hơn 30 ngày:

```bash
gcloud storage buckets create gs://docusyncai-backup-<chuỗi riêng> --location asia-southeast1 --uniform-bucket-level-access
cat > /tmp/lifecycle.json <<'EOF'
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 30}}]}
EOF
gcloud storage buckets update gs://docusyncai-backup-<chuỗi riêng> --lifecycle-file /tmp/lifecycle.json
```

Trong máy ảo, chạy thử rồi đặt lịch hằng ngày:

```bash
GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng> /opt/docusyncai/deploy/gcp/backup-to-gcs.sh
crontab -e
# 0 2 * * * GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng> /opt/docusyncai/deploy/gcp/backup-to-gcs.sh >> /var/log/docusyncai-backup.log 2>&1
```

Thêm một lớp nữa: **Compute Engine → Snapshots → Create snapshot schedule** cho ổ đĩa máy ảo (hằng ngày, giữ 7 bản).
Mỗi tháng thử khôi phục một bản theo [DEPLOYMENT.md](../../DEPLOYMENT.md#5-sao-lưu-và-khôi-phục).

## 7. Cập nhật bản mới và quay lại bản cũ

Sau khi đẩy code lên nhánh `main`:

```bash
gcloud compute ssh docusyncai -- /opt/docusyncai/deploy/gcp/update.sh
```

Script sao lưu trước, kéo mã mới, build và chạy lại, chờ backend healthy. Lỗi thì quay về commit trước:

```bash
gcloud compute ssh docusyncai -- /opt/docusyncai/deploy/gcp/update.sh <mã commit cũ>
```

Migration chỉ nên thêm (thêm cột/bảng), không xóa ngay, để bản cũ vẫn chạy được khi quay lại. Nếu migration đã đổi dữ
liệu thì khôi phục bản sao lưu vừa tạo.

### Tự động deploy khi push

Workflow `.github/workflows/deploy.yml` chạy sau khi CI trên `main` thành công: SSH vào máy ảo và chạy `update.sh`
với đúng commit vừa qua CI. CI lỗi thì không deploy. Cài một lần:

1. Trên máy ảo, tạo khóa SSH chỉ dùng cho deploy và cho phép nó đăng nhập:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C github-deploy
   cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
   whoami                     # tên user, dùng cho DEPLOY_USER
   base64 -w0 ~/.ssh/github_deploy; echo   # khóa bí mật dạng một dòng, dán vào DEPLOY_SSH_KEY
   ```
2. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**, tạo 3 secret:
   `DEPLOY_HOST` = IP tĩnh, `DEPLOY_USER` = kết quả `whoami`, `DEPLOY_SSH_KEY` = nội dung khóa bí mật.
3. Xóa file khóa bí mật trên máy ảo sau khi đã dán: `rm ~/.ssh/github_deploy`.
4. Thử: tab **Actions → Deploy → Run workflow**.

Workflow dùng environment `production`; có thể bật **Required reviewers** cho environment này (Settings →
Environments) nếu muốn bấm duyệt trước mỗi lần deploy.

## 8. Theo dõi

- **Uptime**: UptimeRobot (miễn phí) kiểm tra `https://app.tenmien.vn` mỗi 5 phút. Endpoint `/health/ready` của backend
  không đi qua nginx; container tự healthcheck bằng nó, xem trạng thái bằng `docker compose -f docker-compose.yml ps`.
- **Log**: `docker compose -f docker-compose.yml logs -f backend`.
- **Máy ảo**: Compute Engine → VM → Observability xem CPU, RAM, ổ đĩa.
- **OpenAI**: đặt giới hạn chi tiêu trong trang Billing của OpenAI.

## Khi gần hết Free Trial

Khoảng ngày 80, chọn một trong ba:

1. **Upgrade** tài khoản sang trả phí, chạy tiếp khoảng 38 USD/tháng.
2. **Chuyển nhà**: lấy bản backup mới nhất từ bucket, cài VPS khác (Hetzner, BizFly, DigitalOcean) theo đúng các bước
   4–5, rồi khôi phục bằng `scripts/restore_db.sh`. Trỏ lại tên miền.
3. **Chỉ để demo**: đổi máy sang e2-micro (gói Always Free, chỉ ở us-west1/us-central1/us-east1, 1 GB RAM, chậm).

Tải backup về trước ngày hết hạn trong mọi trường hợp.

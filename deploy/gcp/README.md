# Triển khai DocuSyncAI lên Google Cloud (1 máy ảo e2-micro Always Free + Docker Compose)

Một máy ảo Compute Engine **e2-micro** (2 vCPU dùng chung, 1 GB RAM, thêm 2 GB swap) ở **us-west1** chạy
`docker-compose.yml` của repo: `postgres`, `backend` (1 worker uvicorn) và `web` (Caddy: HTTPS tự động, phục vụ file
tĩnh của frontend, proxy `/api`, `/health` và WebSocket). Image build trên GitHub Actions và đẩy lên GHCR; máy ảo chỉ
pull, không build (build trên máy 1 GB sẽ hết RAM). Bản sao lưu đẩy lên Cloud Storage.

Đang chạy máy e2-medium cũ ở Singapore? Làm theo [MIGRATE_TO_FREE_TIER.md](MIGRATE_TO_FREE_TIER.md).

Chi phí: nằm trong gói Always Free nếu đúng các điều kiện dưới đây (kiểm tra lại trên https://cloud.google.com/free):

| Hạng mục | Điều kiện miễn phí |
|---|---|
| Máy ảo | 1 máy e2-micro ở `us-west1`, `us-central1` hoặc `us-east1` |
| Ổ đĩa | Tối đa 30 GB **pd-standard** (pd-balanced/pd-ssd bị tính tiền) |
| Mạng ra | 1 GB/tháng ra internet (trừ Trung Quốc, Úc); vượt thì vài cent mỗi GB |
| Cloud Storage | 5 GB ở bucket vùng Mỹ (một trong ba vùng trên) |
| IP ngoài | Xem trang giá "External IP addresses"; kiểm tra Billing → Reports sau vài ngày |
| Giám sát | Uptime Check trong hạn mức miễn phí; cảnh báo (alerting) có thể tính khoảng 0,1 USD/tháng mỗi điều kiện theo bảng giá mới |

Đặt **Billing → Budgets & alerts** 1 USD để biết ngay nếu có khoản bị tính tiền.

Mọi lệnh `gcloud` dưới đây chạy trong **Cloud Shell** (biểu tượng `>_` trên console.cloud.google.com).

## 1. Tạo project và đặt cảnh báo ngân sách

1. Đăng ký tài khoản tại https://cloud.google.com/free (cần thẻ để xác minh).
2. Tạo project, ví dụ `docusyncai-prod`.
3. **Billing → Budgets & alerts → Create budget**: 1 USD, cảnh báo ở 50% và 100%.

```bash
gcloud config set project docusyncai-prod
gcloud config set compute/region us-west1
gcloud config set compute/zone us-west1-b
gcloud services enable compute.googleapis.com storage.googleapis.com monitoring.googleapis.com
```

## 2. IP tĩnh, tường lửa, máy ảo

```bash
gcloud compute addresses create docusyncai-free-ip --region us-west1
gcloud compute addresses describe docusyncai-free-ip --region us-west1 --format='value(address)'   # ghi lại IP

gcloud compute firewall-rules create allow-web --allow tcp:80,tcp:443 --target-tags web   # bỏ qua nếu đã có

gcloud compute instances create docusyncai-free \
  --machine-type e2-micro \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-standard \
  --address docusyncai-free-ip --tags web \
  --scopes https://www.googleapis.com/auth/devstorage.read_write,https://www.googleapis.com/auth/logging.write
```

Chỉ mở 80 và 443. SSH (22) đã có sẵn trong rule mặc định của GCP; Postgres và backend không mở ra ngoài.

## 3. Tên miền

Đang dùng DuckDNS: vào https://www.duckdns.org, sửa IP của `docusyncai` thành IP tĩnh ở bước 2. Có tên miền riêng thì
tạo bản ghi `A` trỏ về IP đó. Caddy tự xin chứng chỉ HTTPS khi tên miền đã trỏ đúng.

## 4. Cài máy ảo và mã nguồn

```bash
gcloud compute ssh docusyncai-free
```

Trong máy ảo:

```bash
git clone https://github.com/ChuThanhDung/web_thuctap.git /tmp/src
sudo bash /tmp/src/deploy/gcp/setup-vm.sh   # Docker, swap 2 GB, swappiness=10, /var/backups và /var/log/docusyncai
exit                                        # đăng xuất để nhận quyền docker
```

SSH lại rồi clone vào thư mục chạy chính. Repo private thì tạo **fine-grained token** (GitHub → Settings → Developer
settings, quyền Contents: Read-only cho đúng repo này) và dùng làm mật khẩu khi `git clone` hỏi.

```bash
gcloud compute ssh docusyncai-free
git clone https://github.com/ChuThanhDung/web_thuctap.git /opt/docusyncai
cd /opt/docusyncai
git config credential.helper store     # nhớ token cho các lần update sau
free -h                                # Swap: 2.0Gi
```

Đăng nhập GHCR để pull image khi chạy `update.sh` bằng tay (deploy tự động đã có token tạm riêng). Tạo **Personal access
token (classic)** chỉ có quyền `read:packages`:

```bash
docker login ghcr.io -u <tên GitHub>   # dán token khi hỏi mật khẩu
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
CORS_ORIGINS=https://app.tenmien.vn
APP_FRONTEND_URL=https://app.tenmien.vn
POSTGRES_PASSWORD=<chuỗi hex thứ nhất>
DOCKER_DATABASE_URL=postgresql+psycopg://admin:<chuỗi hex thứ nhất>@postgres:5432/docusyncai
SEED_DEFAULT_PASSWORD=<chuỗi hex thứ hai>
OPENAI_API_KEY=<khóa OpenAI>
OPENAI_DOCUMENT_MODEL=gpt-4o-mini
```

Thêm cấu hình SMTP nếu cần email từ chối batch và cảnh báo. Đã có máy chạy rồi thì dùng `bash deploy/gcp/make-env.sh` để
sinh lại `.env` gọn.

```bash
chmod 600 .env
deploy/gcp/update.sh                         # pull image của commit mới nhất trên main rồi chạy
docker compose -f docker-compose.yml ps
```

Mở `https://app.tenmien.vn`, đăng nhập `chief.accountant@docusync.ai` / `accountant@docusync.ai` bằng
`SEED_DEFAULT_PASSWORD`, rồi **đổi mật khẩu ngay**. Thêm người dùng thật xong thì đặt `SEED_DEFAULT_USERS=false`.

## 6. Sao lưu tự động lên Cloud Storage

Trong Cloud Shell, tạo bucket ở **cùng vùng Mỹ** với máy ảo (nằm trong 5 GB miễn phí):

```bash
gcloud storage buckets create gs://docusyncai-backup-<chuỗi riêng> --location us-west1 --uniform-bucket-level-access
```

`deploy/gcp/backup-to-gcs.sh` sao lưu DB (`pg_dump -Fc`, có kiểm tra đọc lại) và file chứng từ, đẩy lên `daily/`; bản
của ngày Chủ nhật được chép thêm vào `weekly/`. Giữ **7 bản ngày và 4 bản tuần**, xóa theo số lượng (không theo tuổi)
nên cron hỏng vài ngày cũng không mất bản cũ. Bản trên máy giữ 3 ngày.

Trong máy ảo, chạy thử rồi đặt lịch (`crontab -e`):

```cron
GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng>
0 2 * * * /opt/docusyncai/deploy/gcp/backup-to-gcs.sh >> /var/log/docusyncai/backup.log 2>&1
0 4 1 * * /opt/docusyncai/deploy/gcp/restore-from-gcs.sh --drill >> /var/log/docusyncai/restore-drill.log 2>&1
0 1 * * * cd /opt/docusyncai && docker compose -f docker-compose.yml exec -T backend python scripts/send_renewal_reminders.py >> /var/log/docusyncai/renewal.log 2>&1
30 1 * * * cd /opt/docusyncai && docker compose -f docker-compose.yml exec -T backend python scripts/process_company_deletions.py >> /var/log/docusyncai/deletions.log 2>&1
```

### Khôi phục và diễn tập khôi phục

```bash
export GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng>
deploy/gcp/restore-from-gcs.sh --list                    # các bản có trên bucket
deploy/gcp/restore-from-gcs.sh --drill                   # diễn tập với bản mới nhất
deploy/gcp/restore-from-gcs.sh 20270110_020001 --yes     # khôi phục thật (GHI ĐÈ DB và file)
```

- `--drill` khôi phục vào database tạm `docusyncai_restore_drill` trong cùng Postgres, in số dòng của `users`,
  `document_batches`, `uploaded_files`, `audit_logs` và phiên bản migration, rồi xóa database tạm. Không đụng dữ liệu
  đang chạy, nên đặt cron ngày 1 hằng tháng (dòng thứ hai ở trên). **Mỗi tháng xem
  `/var/log/docusyncai/restore-drill.log`**: dòng cuối phải là `OK: diễn tập khôi phục thành công`, số dòng tăng dần
  theo thời gian. Ba tháng một lần nên khôi phục thật lên một máy ảo tạm (làm theo bước 2–6 của
  [MIGRATE_TO_FREE_TIER.md](MIGRATE_TO_FREE_TIER.md)) rồi xóa máy đó.
- Khôi phục thật dừng backend, chạy `scripts/restore_db.sh` (`pg_restore --clean`), giải nén file chứng từ và ảnh đại
  diện vào volume, rồi chạy lại backend và chờ healthy.

## 7. Cập nhật bản mới và quay lại bản cũ

Sau khi đẩy code lên nhánh `main`, workflow **Deploy** tự build image và cập nhật máy ảo. Chạy tay khi cần:

```bash
gcloud compute ssh docusyncai-free -- /opt/docusyncai/deploy/gcp/update.sh             # commit mới nhất của main
gcloud compute ssh docusyncai-free -- /opt/docusyncai/deploy/gcp/update.sh <commit cũ>  # quay lại
```

Script: chờ khóa `flock` (không chạy chồng với lượt deploy tự động) → sao lưu → `git checkout` đúng commit (để có
compose, Caddyfile, script khớp phiên bản) → pull image `ghcr.io/<owner>/docusyncai-backend:<commit>` và
`docusyncai-web:<commit>` → ghi `IMAGE_REGISTRY`, `IMAGE_TAG` vào `.env` → chạy lại → chờ backend healthy (180 giây).
Chỉ quay lại được commit **đã có image trên GHCR** (commit build bằng workflow mới); image cũ đã xóa khỏi máy thì
script tự pull lại.

Migration chỉ nên thêm (thêm cột/bảng), không xóa ngay, để bản cũ vẫn chạy được khi quay lại. Nếu migration đã đổi dữ
liệu thì khôi phục bản sao lưu vừa tạo (`/var/backups/docusyncai`, `scripts/restore_db.sh`).

### Tự động deploy khi push

`.github/workflows/deploy.yml` chạy sau khi CI trên `main` thành công:

1. Job `build`: build image `backend` và `web` (frontend kèm Caddy), đẩy lên GHCR với tag là mã commit và `latest`.
2. Job `deploy`: SSH vào máy ảo chạy `update.sh <commit>`. Token đọc GHCR tạm thời (hết hạn khi job xong) đi qua stdin,
   không lưu trên máy ảo.

CI lỗi thì không deploy. Cài một lần:

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

Image trên GHCR là private theo repo. Dung lượng gói miễn phí của GitHub Packages có hạn, nên job `build` tự xóa bản
cũ, chỉ giữ 10 bản mới nhất của mỗi image (quay lại được tối đa 10 lần deploy trước). Nếu bước xóa báo lỗi quyền:
GitHub → Packages → `docusyncai-backend` → Package settings → Manage Actions access, cho repo quyền **Admin**.

## 8. Giám sát miễn phí

### Uptime Check (web sập thì gửi email)

Backend có `/health` (tiến trình còn sống) và `/health/ready` (kèm kiểm tra DB); Caddy chuyển cả hai tới backend nên
gọi được từ ngoài. Lưu ý đường dẫn là `/health`, **không phải** `/api/v1/health`.

1. Console → **Monitoring → Uptime checks → Create uptime check**.
2. Protocol **HTTPS**, Resource type **URL**, Hostname `docusyncai.duckdns.org`, Path `/health`, Check frequency
   **5 minutes**. Mục Response validation: Response content contains `"status":"ok"`.
3. Regions: để mặc định (tối thiểu 3 vùng). Mỗi tháng khoảng 26 nghìn lượt kiểm tra, nằm trong hạn mức miễn phí.
4. Mục **Alert & notification**: bật tạo alert policy, Duration 5 phút; Notification channel → **Manage notification
   channels → Email** thêm email của bạn. Tên check: `docusyncai-health`.
5. Bấm **Test** trước khi Create: phải trả 200.

Muốn chắc chắn 0 đồng (Cloud Monitoring có thể tính phí cảnh báo theo bảng giá mới): dùng UptimeRobot gói free kiểm tra
`https://docusyncai.duckdns.org/health` mỗi 5 phút, gửi email.

### RAM và ổ đĩa vượt 85%

Ops Agent của GCP tốn 100–200 MB RAM, quá nặng cho e2-micro. Thay vào đó `deploy/gcp/check-resources.sh` đọc
`/proc/meminfo` và `df`, gửi email (dùng SMTP trong `.env`) khi RAM hoặc ổ đĩa vượt ngưỡng, tối đa một lần mỗi 12 giờ
cho mỗi loại. Thêm vào `crontab -e`:

```cron
*/10 * * * * ALERT_EMAIL=<email nhận cảnh báo> /opt/docusyncai/deploy/gcp/check-resources.sh >> /var/log/docusyncai/resources.log 2>&1
```

Ngưỡng đổi bằng `MEM_THRESHOLD`, `DISK_THRESHOLD`. Thử gửi ngay: `MEM_THRESHOLD=1 deploy/gcp/check-resources.sh`.

### Sentry (lỗi backend và frontend, gói free)

Tạo tài khoản https://sentry.io (gói Developer miễn phí), tạo 2 project: **FastAPI** (backend) và **React** (frontend).
Mỗi project có một DSN. Để trống DSN thì Sentry tắt hẳn (không nạp thư viện).

- Backend: thêm `SENTRY_DSN=<DSN của project FastAPI>` vào `.env` trên máy ảo (hoặc qua `make-env.sh`), rồi
  `docker compose -f docker-compose.yml up -d --no-build backend`. Không gửi dữ liệu cá nhân (`send_default_pii=False`);
  `SENTRY_TRACES_SAMPLE_RATE` mặc định 0 (chỉ gửi lỗi, tiết kiệm hạn mức).
- Frontend: DSN được nhúng lúc build, nên đặt ở GitHub → repo → **Settings → Secrets and variables → Actions →
  Variables → New repository variable** `VITE_SENTRY_DSN` = DSN của project React. Lần deploy sau sẽ có Sentry.
- Phiên bản (release) trên Sentry là mã commit đang chạy, nên biết lỗi thuộc bản nào.

### Xem nhanh

- Log: `docker compose -f docker-compose.yml logs -f backend`, `... logs -f web`.
- RAM: `free -h`, `docker stats --no-stream`. Lúc nghỉ tổng các container khoảng 200–300 MB.
- Máy ảo: Compute Engine → VM → Observability xem CPU (RAM và ổ đĩa cần Ops Agent, đã thay bằng script ở trên).
- OpenAI: đặt giới hạn chi tiêu trong trang Billing của OpenAI.

## Khi e2-micro không đủ

Xem mục cuối của [MIGRATE_TO_FREE_TIER.md](MIGRATE_TO_FREE_TIER.md#nếu-e2-micro-không-đủ).

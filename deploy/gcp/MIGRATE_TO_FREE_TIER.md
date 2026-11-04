# Chuyển DocuSyncAI từ e2-medium sang e2-micro Always Free

Mục tiêu: trước khi Free Trial hết hạn (khoảng **22/01/2027**), chuyển web từ máy ảo hiện tại sang máy **e2-micro** nằm
trong gói Always Free của Google Cloud, giữ nguyên dữ liệu và tên miền `docusyncai.duckdns.org`.

| | Máy hiện tại | Máy mới |
|---|---|---|
| Loại máy | e2-medium (2 vCPU, 4 GB RAM) | e2-micro (2 vCPU dùng chung, 1 GB RAM + 2 GB swap) |
| Vùng | asia-southeast1 (Singapore) | **us-west1** (Oregon, gần Việt Nam nhất trong 3 vùng miễn phí) |
| IP | 34.143.158.184 | IP tĩnh mới ở us-west1 |
| Ổ đĩa | 30 GB pd-balanced | **30 GB pd-standard** (chỉ loại standard mới miễn phí) |
| Build image | Trên máy ảo | Trên GitHub Actions, máy ảo chỉ pull từ GHCR |
| Container | postgres, backend, frontend (nginx), caddy | postgres, backend, web (Caddy kèm file tĩnh) |

Từ Việt Nam sang Oregon chậm hơn khoảng 150–200 ms mỗi request, chấp nhận được với app nhập liệu.

Toàn bộ lệnh `gcloud` chạy trong **Cloud Shell** (biểu tượng `>_` trên console.cloud.google.com). Lệnh trong máy ảo
chạy sau khi `gcloud compute ssh <tên máy>`. Thời gian web ngừng hoạt động (bước 5–7) khoảng 15–30 phút; nên làm
buổi tối hoặc cuối tuần và báo trước cho người dùng.

## Giới hạn của gói miễn phí (kiểm tra lại trên https://cloud.google.com/free trước khi làm)

- 1 máy e2-micro mỗi tháng ở `us-west1`, `us-central1` hoặc `us-east1`. Máy thứ hai hoặc vùng khác thì tính tiền.
- 30 GB ổ **standard persistent disk** (pd-standard). pd-balanced hay pd-ssd thì tính tiền.
- 1 GB dữ liệu ra internet mỗi tháng (trừ Trung Quốc, Úc). Web vài chục người dùng thường dưới mức này; tải nhiều file
  PDF/ảnh lớn thì có thể vượt và bị tính vài cent mỗi GB.
- Cloud Storage: 5 GB ở vùng Mỹ (bucket phải đặt ở `us-west1`/`us-central1`/`us-east1`, không dùng multi-region `US`).
- IP ngoài: Google tính phí IPv4 đang gắn máy theo giờ; xem trang giá "External IP addresses" xem máy e2-micro free
  tier có được miễn không. Sau 2–3 ngày chạy máy mới, mở **Billing → Reports** để xem chi phí thật.
- Snapshot ổ đĩa không nằm trọn trong gói miễn phí; bản sao lưu lên Cloud Storage (bước 8) đã đủ.

**Trước khi bắt đầu:** Billing → Budgets & alerts → tạo ngân sách **1 USD** cho project, cảnh báo 50% và 100%, để biết
ngay nếu có khoản nào bị tính tiền.

## 0. Chuẩn bị (máy cũ vẫn chạy bình thường)

1. Bản code có cấu hình mới (compose gọn, Caddy phục vụ frontend, build image trên GitHub Actions) đã merge vào `main`
   và workflow **Deploy** chạy xanh. Lần deploy đầu tiên sau khi merge, máy cũ còn script cũ nên vẫn tự build image tại
   chỗ (e2-medium đủ RAM) rồi chuyển sang container `web`; từ lần sau máy cũ cũng pull từ GHCR.
2. Kiểm tra image đã có trên GHCR: GitHub → trang cá nhân → **Packages**: thấy `docusyncai-backend` và `docusyncai-web`.
3. Tạo token chỉ đọc image để máy ảo pull được khi chạy tay (deploy tự động đã có token tạm riêng):
   GitHub → Settings → Developer settings → **Personal access tokens (classic)** → Generate new token, chỉ tick
   `read:packages`, hạn 1 năm. Ghi lại token (dùng ở bước 3).
4. Ghi lại ngày giờ bắt đầu vào `hidden/NHAT_KY_CONG_VIEC.md`.

## 1. Bucket sao lưu ở vùng Mỹ

Trong Cloud Shell (đặt tên bucket riêng, ví dụ thêm chuỗi ngẫu nhiên):

```bash
gcloud config set project docusyncai-prod
BUCKET=gs://docusyncai-backup-<chuỗi riêng>
gcloud storage buckets create $BUCKET --location us-west1 --default-storage-class STANDARD --uniform-bucket-level-access
```

Không cần lifecycle xóa theo tuổi: `backup-to-gcs.sh` tự giữ 7 bản ngày và 4 bản tuần.

## 2. Tạo máy e2-micro

```bash
gcloud compute addresses create docusyncai-free-ip --region us-west1
gcloud compute addresses describe docusyncai-free-ip --region us-west1 --format='value(address)'   # ghi lại: NEW_IP

gcloud compute instances create docusyncai-free \
  --zone us-west1-b \
  --machine-type e2-micro \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-standard \
  --address docusyncai-free-ip --tags web \
  --scopes https://www.googleapis.com/auth/devstorage.read_write,https://www.googleapis.com/auth/logging.write
```

Rule tường lửa `allow-web` (tcp 80, 443 cho tag `web`) đã có từ máy cũ và dùng chung cho cả project, không phải tạo lại.

## 3. Cài máy mới

```bash
gcloud compute ssh docusyncai-free --zone us-west1-b
```

Trong máy mới:

```bash
git clone https://github.com/ChuThanhDung/web_thuctap.git /tmp/src
sudo bash /tmp/src/deploy/gcp/setup-vm.sh        # Docker, swap 2 GB, swappiness, thư mục backup/log
exit
```

SSH lại, clone vào thư mục chạy chính (repo private: dùng fine-grained token Contents read-only làm mật khẩu như máy cũ)
và đăng nhập GHCR bằng token `read:packages` ở bước 0:

```bash
gcloud compute ssh docusyncai-free --zone us-west1-b
git clone https://github.com/ChuThanhDung/web_thuctap.git /opt/docusyncai
cd /opt/docusyncai
git config credential.helper store
docker login ghcr.io -u ChuThanhDung        # dán token read:packages khi hỏi mật khẩu
free -h                                      # phải thấy Swap: 2.0Gi
```

## 4. Chép `.env` từ máy cũ và chạy thử bằng HTTP

Trong Cloud Shell, chép `.env` qua (file chứa bí mật, không để lại bản sao trong Cloud Shell):

```bash
gcloud compute scp docusyncai:/opt/docusyncai/.env /tmp/docusyncai.env --zone asia-southeast1-b
gcloud compute scp /tmp/docusyncai.env docusyncai-free:/opt/docusyncai/.env --zone us-west1-b
rm /tmp/docusyncai.env
```

Trong máy mới, **tạm để trống `DOMAIN`** để Caddy chưa xin chứng chỉ (tên miền vẫn trỏ về máy cũ, xin lúc này sẽ thất
bại và có thể bị Let's Encrypt chặn tạm):

```bash
cd /opt/docusyncai
chmod 600 .env
sed -i 's/^DOMAIN=/#DOMAIN_SAU_KHI_DOI_DNS=/' .env
sed -i '/^FRONTEND_BIND=/d' .env              # biến cũ, không dùng nữa
deploy/gcp/update.sh                         # máy mới chưa có gì để sao lưu; pull image và chạy
docker compose -f docker-compose.yml ps      # postgres, backend, web đều healthy
curl -s http://localhost/health              # {"status":"ok",...}
```

Lúc này DB máy mới còn trống (chỉ có bảng do migration tạo). Mở `http://NEW_IP/` trên trình duyệt để thấy trang đăng
nhập là được, chưa cần đăng nhập.

## 5. Dừng ghi dữ liệu trên máy cũ và sao lưu lần cuối

Báo người dùng ngừng thao tác. Trong máy cũ (`gcloud compute ssh docusyncai --zone asia-southeast1-b`):

```bash
cd /opt/docusyncai
docker compose -f docker-compose.yml ps --services           # xem tên container web đang chạy
docker compose -f docker-compose.yml stop web                # nếu máy cũ còn bản trước: stop caddy frontend
# Web đã tắt với người dùng; backend vẫn chạy để script sao lưu lấy được file chứng từ.
GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng> deploy/gcp/backup-to-gcs.sh
```

Ghi lại mã bộ sao lưu ở dòng cuối (ví dụ `20270110_210501`), gọi là `STAMP`.

## 6. Khôi phục vào máy mới

Trong máy mới:

```bash
cd /opt/docusyncai
export GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng>
deploy/gcp/restore-from-gcs.sh --list
deploy/gcp/restore-from-gcs.sh --drill STAMP      # thử trước vào DB tạm, không ghi đè gì
deploy/gcp/restore-from-gcs.sh STAMP --yes        # khôi phục thật: DB + file chứng từ + ảnh đại diện
```

Kiểm tra nhanh số liệu khớp với máy cũ:

```bash
docker compose -f docker-compose.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from document_batches" -c "select count(*) from users"'
```

Chạy cùng lệnh trên máy cũ và so hai kết quả.

## 7. Đổi DNS DuckDNS và bật HTTPS

1. Vào https://www.duckdns.org, đăng nhập, ở dòng `docusyncai` sửa **current ip** thành `NEW_IP`, bấm **update ip**.
   (Hoặc: `curl "https://www.duckdns.org/update?domains=docusyncai&token=<token DuckDNS>&ip=NEW_IP"`, trả `OK`.)
   Nếu máy cũ có cron tự cập nhật IP DuckDNS thì tắt cron đó (`crontab -l` trên máy cũ), nếu không nó sẽ đổi IP về lại.
2. Đợi tên miền trỏ về IP mới (DuckDNS thường dưới 1 phút):
   ```bash
   getent hosts docusyncai.duckdns.org        # phải ra NEW_IP
   ```
3. Bật lại tên miền trên máy mới để Caddy xin chứng chỉ:
   ```bash
   cd /opt/docusyncai
   sed -i 's/^#DOMAIN_SAU_KHI_DOI_DNS=/DOMAIN=/' .env
   grep '^DOMAIN=' .env                       # DOMAIN=docusyncai.duckdns.org
   docker compose -f docker-compose.yml up -d --no-build web
   docker compose -f docker-compose.yml logs -f web   # đợi dòng "certificate obtained successfully", Ctrl+C
   ```

## 8. Kiểm tra sau khi chuyển

- [ ] `https://docusyncai.duckdns.org/health` trả `{"status":"ok","env":"production"}`; ổ khóa HTTPS hợp lệ.
- [ ] Đăng nhập bằng tài khoản thật; danh sách bộ chứng từ, số lượng khớp máy cũ.
- [ ] Mở một bộ đã duyệt cuối: xem được file PDF/ảnh gốc (file chứng từ đã khôi phục).
- [ ] Tải lên một bộ XML mẫu (`dataset/golden/...`), kết quả đối soát đúng; xóa bộ thử.
- [ ] Thông báo realtime: kế toán viên gửi duyệt, kế toán trưởng thấy chuông báo ngay (WebSocket qua Caddy).
- [ ] Ảnh đại diện hiển thị.
- [ ] Email: `docker compose -f docker-compose.yml exec -T backend python scripts/check_smtp_email.py`.
- [ ] RAM: `free -h` và `docker stats --no-stream`. Tổng các container lúc nghỉ khoảng 200–300 MB, khi AI đọc PDF có
      thể lên 400–500 MB; swap dùng vài trăm MB là bình thường.

## 9. Chuyển deploy tự động sang máy mới

1. Trong máy mới, tạo khóa deploy như hướng dẫn ở [README.md](README.md#tự-động-deploy-khi-push) mục 7 (bước 1).
2. GitHub → repo → Settings → Secrets and variables → Actions: sửa `DEPLOY_HOST` = `NEW_IP`, `DEPLOY_USER` = kết quả
   `whoami` trên máy mới, `DEPLOY_SSH_KEY` = khóa mới.
3. Tab **Actions → Deploy → Run workflow**, đợi xanh. Trên máy mới `grep IMAGE_TAG .env` ra đúng commit vừa deploy.

## 10. Lịch sao lưu, diễn tập, giám sát

Trong máy mới, `crontab -e`, thêm (thay tên bucket và email):

```cron
GCS_BUCKET=gs://docusyncai-backup-<chuỗi riêng>
0 2 * * * /opt/docusyncai/deploy/gcp/backup-to-gcs.sh >> /var/log/docusyncai/backup.log 2>&1
0 4 1 * * /opt/docusyncai/deploy/gcp/restore-from-gcs.sh --drill >> /var/log/docusyncai/restore-drill.log 2>&1
0 1 * * * cd /opt/docusyncai && docker compose -f docker-compose.yml exec -T backend python scripts/send_renewal_reminders.py >> /var/log/docusyncai/renewal.log 2>&1
*/10 * * * * ALERT_EMAIL=<email nhận cảnh báo> /opt/docusyncai/deploy/gcp/check-resources.sh >> /var/log/docusyncai/resources.log 2>&1
```

Chạy thử ngay một lần backup và xem log. Sau đó làm phần giám sát ở [README.md](README.md#8-giám-sát-miễn-phí):
Uptime Check gọi `/health` (5 phút một lần, email khi sập) và Sentry (tùy chọn).

## 11. Dọn máy cũ (sau 1 tuần chạy ổn, và trước 22/01/2027)

Máy cũ để **dừng** (không xóa) khoảng một tuần để quay lại khi cần:

```bash
gcloud compute instances stop docusyncai --zone asia-southeast1-b
```

Máy dừng vẫn tính tiền ổ đĩa và IP tĩnh (trừ vào credit). Sau một tuần ổn định:

```bash
gcloud compute instances delete docusyncai --zone asia-southeast1-b
gcloud compute addresses delete docusyncai-ip --region asia-southeast1
gcloud compute snapshots list            # xóa snapshot cũ nếu có: gcloud compute snapshots delete <tên>
gcloud compute resource-policies list    # xóa lịch snapshot cũ nếu có
```

Bucket sao lưu cũ ở asia-southeast1 (nếu có): tải bản mới nhất về máy cá nhân rồi xóa bucket
(`gcloud storage rm --recursive gs://<bucket cũ>`). Vào Billing → Reports kiểm tra chi phí về 0.

## Quay lại máy cũ khi có sự cố (trong tuần đầu)

1. DuckDNS: đổi IP về `34.143.158.184`.
2. Máy cũ: `gcloud compute instances start docusyncai --zone asia-southeast1-b`, rồi trong máy
   `cd /opt/docusyncai && docker compose -f docker-compose.yml up -d --no-build`.
3. GitHub secrets: trả `DEPLOY_HOST` về IP cũ.
4. Dữ liệu nhập trên máy mới sau lúc chuyển sẽ không có trên máy cũ: sao lưu máy mới bằng `backup-to-gcs.sh` rồi
   khôi phục sang máy cũ bằng `restore-from-gcs.sh` nếu cần giữ.

## Nếu e2-micro không đủ

Dấu hiệu: web chậm hẳn, `free -h` cho thấy swap dùng trên 1 GB thường xuyên, hoặc log có `Out of memory: Killed process`
(`sudo dmesg | grep -i oom`). Cách xử lý theo thứ tự:

1. Giảm số file AI đọc cùng lúc (tải lên từng bộ), kiểm tra `docker stats` xem container nào ăn RAM.
2. Phương án miễn phí lớn hơn ngoài GCP là Oracle Cloud Always Free (4 nhân ARM, 24 GB RAM). Đó là đổi nhà cung cấp,
   cần bàn trước khi làm; image phải build thêm bản `linux/arm64`.
3. Trả phí: đổi loại máy sang e2-small (2 GB RAM, khoảng 13 USD/tháng ở us-west1) bằng
   `gcloud compute instances set-machine-type` (cần dừng máy trước).

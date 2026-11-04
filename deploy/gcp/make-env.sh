#!/usr/bin/env bash
# Tạo lại /opt/docusyncai/.env gọn (chỉ các biến production đang dùng), hỏi từng bí mật, rồi nạp lại toàn bộ.
#   bash deploy/gcp/make-env.sh
# Nhấn Enter ở một câu hỏi để giữ giá trị cũ. Bản cũ được lưu thành .env.bak.<thời gian>.
# Mật khẩu Postgres luôn giữ nguyên: Postgres chỉ đặt mật khẩu lúc tạo dữ liệu, đổi ở đây sẽ làm backend mất kết nối DB.
set -euo pipefail

cd "$(dirname "$0")/../.."
old() { [[ -f .env ]] && grep -m1 "^$1=" .env | cut -d= -f2- || true; }

DB_PASS=$(old POSTGRES_PASSWORD)
if [[ -z "$DB_PASS" ]]; then
  echo "Không thấy POSTGRES_PASSWORD trong .env cũ, dừng để tránh mất kết nối DB." >&2
  exit 1
fi
DB_USER=$(old POSTGRES_USER); DB_USER=${DB_USER:-admin}
DB_NAME=$(old POSTGRES_DB); DB_NAME=${DB_NAME:-docusyncai}

ask() { # ask BIẾN "câu hỏi" giá_trị_cũ [secret]
  local answer
  if [[ "${4:-}" == secret ]]; then
    read -rsp "$2 [Enter = giữ cũ$([[ -n "$3" ]] && echo ", đã có" || echo ", đang trống")]: " answer; echo
  else
    read -rp "$2 [Enter = ${3:-trống}]: " answer
  fi
  printf -v "$1" '%s' "${answer:-$3}"
}

ask DOMAIN "Tên miền (vd docusyncai.duckdns.org)" "$(old DOMAIN)"
ask OPENAI_KEY "OPENAI_API_KEY" "$(old OPENAI_API_KEY)" secret
ask SMTP_USER "Gmail gửi thông báo" "$(old SMTP_USER)"
ask SMTP_PASS "Mật khẩu ứng dụng Gmail (16 ký tự)" "$(old SMTP_PASSWORD)" secret
SMTP_PASS=${SMTP_PASS// /}  # Google hiển thị mã có dấu cách
ask SENTRY_DSN "SENTRY_DSN của backend (Sentry gói free, để trống = tắt)" "$(old SENTRY_DSN)"
ask ALERT_EMAIL "Email nhận cảnh báo RAM/ổ đĩa (để trống = Gmail gửi thông báo)" "$(old ALERT_EMAIL)"
ask SEPAY_BANK_CODE "SePay: mã ngân hàng nhận tiền (vd MBBank; để trống = tắt thanh toán)" "$(old SEPAY_BANK_CODE)"
ask SEPAY_BANK_ACCOUNT "SePay: số tài khoản nhận tiền" "$(old SEPAY_BANK_ACCOUNT)"
ask SEPAY_ACCOUNT_NAME "SePay: tên chủ tài khoản" "$(old SEPAY_ACCOUNT_NAME)"
ask SEPAY_WEBHOOK_API_KEY "SePay: API key của webhook" "$(old SEPAY_WEBHOOK_API_KEY)" secret
# Phiên bản image đang chạy do update.sh ghi; giữ nguyên để không đổi bản đang chạy.
IMAGE_REGISTRY=$(old IMAGE_REGISTRY)
IMAGE_TAG=$(old IMAGE_TAG)

cp .env ".env.bak.$(date +%Y%m%d_%H%M%S)"
umask 077
cat > .env <<EOF
# Sinh bởi deploy/gcp/make-env.sh lúc $(date '+%d/%m/%Y %H:%M')
APP_ENV=production
LOG_FORMAT=json

# Tên miền và HTTPS (Caddy tự xin chứng chỉ; để trống thì chỉ chạy HTTP cổng 80)
DOMAIN=$DOMAIN
CORS_ORIGINS=https://$DOMAIN
APP_FRONTEND_URL=https://$DOMAIN

# Database (không đổi mật khẩu sau khi đã tạo dữ liệu)
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_DB=$DB_NAME
DOCKER_DATABASE_URL=postgresql+psycopg://$DB_USER:$DB_PASS@postgres:5432/$DB_NAME

# Tài khoản ban đầu đã tạo xong, không tạo lại
SEED_DEFAULT_USERS=false

# AI đọc chứng từ
OPENAI_API_KEY=$OPENAI_KEY
OPENAI_DOCUMENT_MODEL=gpt-6-luna
# Model mạnh đọc PDF/ảnh lâu hơn: cho mỗi lần đọc tối đa 3 phút
OPENAI_TIMEOUT_SECONDS=180

# Email thông báo từ chối bộ chứng từ (Gmail + mật khẩu ứng dụng)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$SMTP_USER
SMTP_PASSWORD=$SMTP_PASS
SMTP_FROM=$SMTP_USER
SMTP_TLS=true

# Giám sát lỗi (Sentry gói free). Frontend đặt DSN riêng ở GitHub → Settings → Variables → VITE_SENTRY_DSN.
SENTRY_DSN=$SENTRY_DSN
# Email nhận cảnh báo của deploy/gcp/check-resources.sh
ALERT_EMAIL=$ALERT_EMAIL

# Thanh toán chuyển khoản qua SePay; webhook: https://$DOMAIN/api/v1/billing/webhook (xác thực API Key)
SEPAY_BANK_CODE=$SEPAY_BANK_CODE
SEPAY_BANK_ACCOUNT=$SEPAY_BANK_ACCOUNT
SEPAY_ACCOUNT_NAME=$SEPAY_ACCOUNT_NAME
SEPAY_WEBHOOK_API_KEY=$SEPAY_WEBHOOK_API_KEY

# Image đang chạy (deploy/gcp/update.sh tự cập nhật hai dòng này)
IMAGE_REGISTRY=$IMAGE_REGISTRY
IMAGE_TAG=$IMAGE_TAG
EOF
chmod 600 .env
echo "Đã ghi .env mới (bản cũ: $(ls -t .env.bak.* | head -1))."

# Không build trên máy ảo: dùng image đã pull (update.sh).
docker compose -f docker-compose.yml up -d --no-build --force-recreate --remove-orphans
echo "Chờ backend sẵn sàng..."
for _ in $(seq 1 30); do
  docker compose -f docker-compose.yml ps backend | grep -q healthy && break
  sleep 5
done
docker compose -f docker-compose.yml ps

if [[ -n "$SMTP_USER" ]]; then
  docker compose -f docker-compose.yml exec -T backend python scripts/check_smtp_email.py --to "$SMTP_USER" || true
fi

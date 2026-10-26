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

cp .env ".env.bak.$(date +%Y%m%d_%H%M%S)"
umask 077
cat > .env <<EOF
# Sinh bởi deploy/gcp/make-env.sh lúc $(date '+%d/%m/%Y %H:%M')
APP_ENV=production
LOG_FORMAT=json

# Tên miền và HTTPS (Caddy)
DOMAIN=$DOMAIN
FRONTEND_BIND=127.0.0.1
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
OPENAI_DOCUMENT_MODEL=gpt-4o-mini

# Email thông báo từ chối bộ chứng từ (Gmail + mật khẩu ứng dụng)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$SMTP_USER
SMTP_PASSWORD=$SMTP_PASS
SMTP_FROM=$SMTP_USER
SMTP_TLS=true
EOF
chmod 600 .env
echo "Đã ghi .env mới (bản cũ: $(ls -t .env.bak.* | head -1))."

docker compose -f docker-compose.yml --profile https up -d --force-recreate
echo "Chờ backend sẵn sàng..."
for _ in $(seq 1 30); do
  docker compose -f docker-compose.yml ps backend | grep -q healthy && break
  sleep 5
done
docker compose -f docker-compose.yml ps

if [[ -n "$SMTP_USER" ]]; then
  docker compose -f docker-compose.yml exec -T backend python scripts/check_smtp_email.py --to "$SMTP_USER" || true
fi

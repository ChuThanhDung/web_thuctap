#!/usr/bin/env bash
# Bảo đảm .env trên máy chủ có các khóa ứng dụng tự sinh được. Chạy lại nhiều lần không sao (chỉ thêm khi thiếu).
# - DATA_ENCRYPTION_KEY: khóa mã hóa CCCD, địa chỉ, khóa 2FA (src/services/crypto.py). Mất khóa thì không đọc lại được
#   dữ liệu đã mã hóa: sao lưu dòng này vào trình quản lý mật khẩu. Không bao giờ đổi khóa đang dùng.
# Deploy (GitHub Actions) gửi script này qua SSH trước update.sh; chạy tay: bash deploy/gcp/ensure-secrets.sh
set -euo pipefail
cd "${APP_DIR:-/opt/docusyncai}"
if ! grep -q '^DATA_ENCRYPTION_KEY=.' .env; then
  umask 077
  printf 'DATA_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32 | tr '+/' '-_')" >> .env
  echo "Đã tạo DATA_ENCRYPTION_KEY trong .env. Hãy sao lưu khóa này (mất khóa = mất CCCD/địa chỉ đã mã hóa)."
fi

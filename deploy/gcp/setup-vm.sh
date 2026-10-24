#!/usr/bin/env bash
# Chuẩn bị máy ảo GCP (Ubuntu 24.04) để chạy DocuSyncAI bằng Docker Compose. Chạy một lần, bằng sudo:
#   sudo bash deploy/gcp/setup-vm.sh
# Việc làm: cài Docker + Compose plugin, tạo swap 2 GB, bật tự cập nhật bảo mật, chuẩn bị /opt/docusyncai.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Chạy bằng sudo." >&2
  exit 1
fi

APP_DIR=/opt/docusyncai
APP_USER="${SUDO_USER:-$(logname)}"

apt-get update
apt-get install -y ca-certificates curl git unattended-upgrades

# Docker từ kho chính thức (có sẵn docker compose plugin).
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$APP_USER"

# Swap 2 GB: lúc build frontend (npm) hoặc khi AI xử lý nhiều file cùng lúc không bị hết RAM.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Giới hạn log Docker để không đầy ổ đĩa.
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
systemctl restart docker

dpkg-reconfigure -f noninteractive unattended-upgrades

mkdir -p "$APP_DIR" /var/backups/docusyncai
chown "$APP_USER":"$APP_USER" "$APP_DIR" /var/backups/docusyncai

echo "Xong. Đăng xuất rồi SSH lại để dùng docker không cần sudo, sau đó clone mã nguồn vào $APP_DIR."

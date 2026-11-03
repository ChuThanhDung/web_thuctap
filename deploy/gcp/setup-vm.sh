#!/usr/bin/env bash
# Chuẩn bị máy ảo GCP (Ubuntu 24.04, e2-micro Always Free 1 GB RAM) để chạy DocuSyncAI bằng Docker Compose.
# Chạy một lần, bằng sudo:
#   sudo bash deploy/gcp/setup-vm.sh
# Việc làm: cài Docker + Compose plugin, tạo swap 2 GB, bật tự cập nhật bảo mật, chuẩn bị /opt/docusyncai,
# /var/backups/docusyncai và /var/log/docusyncai (log của cron sao lưu, cảnh báo). Chạy lại nhiều lần không sao.
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

# Swap 2 GB: e2-micro chỉ có 1 GB RAM; khi AI xử lý nhiều file cùng lúc hoặc lúc pull image, phần dư tràn sang swap
# thay vì bị kernel giết tiến trình (OOM). Kiểm tra: free -h, swapon --show.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Ưu tiên giữ tiến trình đang chạy trong RAM, chỉ đẩy sang swap khi thật sự thiếu (mặc định 60 làm web chậm hơn).
echo 'vm.swappiness=10' > /etc/sysctl.d/99-docusyncai.conf
sysctl -p /etc/sysctl.d/99-docusyncai.conf

# Giới hạn log Docker để không đầy ổ đĩa.
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
systemctl restart docker

dpkg-reconfigure -f noninteractive unattended-upgrades

mkdir -p "$APP_DIR" /var/backups/docusyncai /var/log/docusyncai
chown "$APP_USER":"$APP_USER" "$APP_DIR" /var/backups/docusyncai /var/log/docusyncai

# Script sao lưu dùng gcloud (có sẵn trên image Ubuntu của GCP dạng snap).
command -v gcloud >/dev/null || echo "Chú ý: chưa có gcloud, cài bằng: snap install google-cloud-cli --classic" >&2

echo "Xong. Đăng xuất rồi SSH lại để dùng docker không cần sudo, sau đó clone mã nguồn vào $APP_DIR."

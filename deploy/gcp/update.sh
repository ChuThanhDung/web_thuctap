#!/usr/bin/env bash
# Cập nhật bản mới trên máy ảo: sao lưu -> kéo mã (compose, Caddyfile, script) -> pull image đã build sẵn trên
# GitHub Actions (GHCR) -> chạy lại. Máy ảo KHÔNG build image (e2-micro 1 GB RAM sẽ hết bộ nhớ).
# Migration tự chạy khi backend khởi động.
#   deploy/gcp/update.sh            # lên commit mới nhất của main (đợi workflow Deploy build xong image)
#   deploy/gcp/update.sh <commit>   # chuyển tới / quay về một commit (chỉ commit đã có image trên GHCR)
# GitHub Actions gọi với GHCR_TOKEN_STDIN=1 và đưa token tạm qua stdin. Chạy tay thì máy ảo phải đăng nhập GHCR
# một lần bằng token chỉ đọc (deploy/gcp/README.md, mục 4).
set -euo pipefail

env_value() { grep -m1 "^$1=" .env | cut -d= -f2- || true; }
set_env() { # ghi/đè một dòng KEY=VALUE trong .env, giữ nguyên các dòng khác
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}

# Bọc trong main để bash đọc hết script trước khi `git checkout` thay file này.
main() {
  cd "$(dirname "$0")/../.."
  # Chạy tay và GitHub Actions có thể trùng lúc: chờ lượt kia xong thay vì cùng tạo lại container (lỗi trùng tên).
  exec 9>/tmp/docusyncai-deploy.lock
  flock 9
  local compose=(docker compose -f docker-compose.yml)

  local token=""
  if [[ "${GHCR_TOKEN_STDIN:-}" == 1 ]]; then
    IFS= read -r token || true
  fi

  if [[ -n "$("${compose[@]}" ps --status running -q postgres 2>/dev/null)" ]]; then
    BACKUP_DIR=/var/backups/docusyncai KEEP_DAYS=7 bash scripts/backup_db.sh
  else
    echo "Postgres chưa chạy (máy mới), bỏ qua sao lưu."
  fi

  git fetch --prune origin
  git checkout --detach "${1:-origin/main}"
  local tag owner registry
  tag=$(git rev-parse HEAD)
  owner=$(git config --get remote.origin.url | sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#' | tr '[:upper:]' '[:lower:]')
  registry=$(env_value IMAGE_REGISTRY)
  registry=${registry:-ghcr.io/$owner}
  export IMAGE_REGISTRY="$registry" IMAGE_TAG="$tag"

  if [[ -n "$token" ]]; then
    # Đăng nhập vào thư mục cấu hình tạm, không ghi đè token GHCR lâu dài (nếu có) trong ~/.docker.
    DOCKER_TMP=$(mktemp -d)
    trap 'rm -rf "$DOCKER_TMP"' EXIT
    printf '%s' "$token" | DOCKER_CONFIG="$DOCKER_TMP" docker login ghcr.io -u github-actions --password-stdin >/dev/null
    DOCKER_CONFIG="$DOCKER_TMP" "${compose[@]}" pull backend web
  else
    "${compose[@]}" pull backend web
  fi

  # Chỉ ghim phiên bản vào .env sau khi pull thành công, để lệnh docker compose chạy tay sau này dùng đúng image.
  set_env IMAGE_REGISTRY "$registry"
  set_env IMAGE_TAG "$tag"

  "${compose[@]}" up -d --no-build --remove-orphans
  # Xóa image không còn container nào dùng (bản cũ); quay lại bản cũ thì update.sh pull lại.
  docker image prune -af >/dev/null

  echo "Đang chờ backend sẵn sàng..."
  for _ in $(seq 1 36); do
    if "${compose[@]}" ps backend | grep -q healthy; then
      "${compose[@]}" ps
      echo "OK: đang chạy commit ${tag:0:7}"
      return 0
    fi
    sleep 5
  done
  echo "Backend chưa healthy sau 180 giây, xem log: docker compose -f docker-compose.yml logs backend" >&2
  return 1
}

main "$@"

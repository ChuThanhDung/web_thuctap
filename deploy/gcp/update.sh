#!/usr/bin/env bash
# Cập nhật bản mới trên máy ảo: sao lưu -> kéo mã mới -> build và chạy lại (migration tự chạy khi backend khởi động).
#   deploy/gcp/update.sh            # cập nhật lên commit mới nhất của nhánh main
#   deploy/gcp/update.sh <commit>   # quay về / chuyển tới một commit cụ thể (rollback)
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.yml --profile https)

BACKUP_DIR=/var/backups/docusyncai scripts/backup_db.sh

git fetch --prune origin
git checkout --detach "${1:-origin/main}"

"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

echo "Đang chờ backend sẵn sàng..."
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" ps backend | grep -q healthy; then
    "${COMPOSE[@]}" ps
    echo "OK: đang chạy commit $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 5
done
echo "Backend chưa healthy sau 150 giây, xem log: docker compose -f docker-compose.yml logs backend" >&2
exit 1

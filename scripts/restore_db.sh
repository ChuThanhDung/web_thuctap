#!/usr/bin/env bash
# Khôi phục PostgreSQL từ file dump do backup_db.sh tạo. GHI ĐÈ dữ liệu hiện tại.
#
# Dùng: scripts/restore_db.sh backups/db_YYYYMMDD_HHMMSS.dump --yes
set -euo pipefail

cd "$(dirname "$0")/.."
DUMP="${1:-}"
CONFIRM="${2:-}"
COMPOSE_ARGS="${COMPOSE_ARGS--f docker-compose.yml}"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Dùng: $0 <file.dump> --yes" >&2
  exit 2
fi
if [[ "$CONFIRM" != "--yes" ]]; then
  echo "Thao tác này ghi đè database hiện tại. Chạy lại với --yes để xác nhận." >&2
  exit 2
fi

# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DUMP"
echo "Đã khôi phục từ $DUMP. Khởi động lại backend: docker compose $COMPOSE_ARGS restart backend"

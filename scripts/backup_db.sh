#!/usr/bin/env bash
# Sao lưu PostgreSQL (định dạng custom của pg_dump) và thư mục file upload.
#
# Dùng:
#   scripts/backup_db.sh                       # production (docker-compose.yml)
#   COMPOSE_ARGS="" scripts/backup_db.sh       # dev (nạp cả docker-compose.override.yml)
# Biến môi trường: BACKUP_DIR (mặc định ./backups), KEEP_DAYS (mặc định 14), COMPOSE_ARGS (mặc định "-f docker-compose.yml").
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE_ARGS="${COMPOSE_ARGS--f docker-compose.yml}"
STAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/db_${STAMP}.dump"
FILES_FILE="$BACKUP_DIR/storage_${STAMP}.tar.gz"

# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DB_FILE"
# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T backend sh -c 'tar czf - -C /app storage invoice' > "$FILES_FILE"

# Xác minh bản dump đọc được trước khi coi là thành công.
# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T postgres pg_restore --list < "$DB_FILE" > /dev/null

find "$BACKUP_DIR" -type f \( -name 'db_*.dump' -o -name 'storage_*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete

echo "OK: $DB_FILE ($(du -h "$DB_FILE" | cut -f1)), $FILES_FILE ($(du -h "$FILES_FILE" | cut -f1))"

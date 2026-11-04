#!/usr/bin/env bash
# Khôi phục DocuSyncAI từ bản sao lưu trên Cloud Storage (do backup-to-gcs.sh tạo).
#
#   GCS_BUCKET=gs://ten-bucket deploy/gcp/restore-from-gcs.sh --list
#       Liệt kê các bản có thể khôi phục.
#   GCS_BUCKET=gs://ten-bucket deploy/gcp/restore-from-gcs.sh --drill [STAMP]
#       DIỄN TẬP: khôi phục DB vào database tạm `<db>_restore_drill`, đếm vài bảng rồi xóa database tạm.
#       Không đụng dữ liệu đang chạy, chạy được bất cứ lúc nào (nên làm mỗi tháng).
#   GCS_BUCKET=gs://ten-bucket deploy/gcp/restore-from-gcs.sh STAMP --yes
#       KHÔI PHỤC THẬT: GHI ĐÈ database và file chứng từ hiện tại bằng bộ STAMP (vd 20270110_020001 hoặc "latest").
#       Dùng khi chuyển máy ảo hoặc khi mất dữ liệu. Backend tạm dừng trong lúc khôi phục.
# STAMP tìm trong daily/ trước rồi tới weekly/. Bỏ trống STAMP ở --drill = bản mới nhất.
set -euo pipefail

: "${GCS_BUCKET:?Đặt GCS_BUCKET, ví dụ gs://docusyncai-backup}"
GCS_BUCKET=${GCS_BUCKET%/}
cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.yml)
WORK_DIR=$(mktemp -d "${TMPDIR:-/var/tmp}/docusyncai-restore.XXXXXX")
trap 'rm -rf "$WORK_DIR"' EXIT

list() {
  for prefix in daily weekly; do
    echo "== $prefix"
    gcloud storage ls "$GCS_BUCKET/$prefix/db_*.dump" 2>/dev/null | sed -E 's#.*/db_(.*)\.dump#  \1#' | sort -r || true
  done
}

find_db() { # find_db <STAMP|latest> -> in ra đường dẫn gs:// của file dump
  local stamp=$1 path
  if [[ "$stamp" == latest ]]; then
    gcloud storage ls "$GCS_BUCKET/daily/db_*.dump" "$GCS_BUCKET/weekly/db_*.dump" 2>/dev/null \
      | sed -E 's#^(.*/db_(.*)\.dump)$#\2 \1#' | sort | tail -1 | cut -d' ' -f2
    return
  fi
  for prefix in daily weekly; do
    path="$GCS_BUCKET/$prefix/db_${stamp}.dump"
    if gcloud storage ls "$path" >/dev/null 2>&1; then echo "$path"; return; fi
  done
}

download() { # download <STAMP|latest> [--with-files]: tải về WORK_DIR, đặt biến DB_FILE / FILES_FILE
  local db
  db=$(find_db "$1")
  [[ -n "$db" ]] || { echo "Không tìm thấy bản sao lưu '$1' trong $GCS_BUCKET. Xem: $0 --list" >&2; exit 1; }
  echo "Tải $db"
  gcloud storage cp "$db" "$WORK_DIR/"
  DB_FILE="$WORK_DIR/$(basename "$db")"
  if [[ "${2:-}" == --with-files ]]; then
    local files=${db/\/db_/\/storage_}
    files=${files%.dump}.tar.gz
    echo "Tải $files"
    gcloud storage cp "$files" "$WORK_DIR/"
    FILES_FILE="$WORK_DIR/$(basename "$files")"
  fi
}

psql_in() { # psql_in <database> <sql>
  "${COMPOSE[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$1' -tAc \"$2\""
}

drill() {
  download "${1:-latest}"
  local main_db drill_db
  main_db=$("${COMPOSE[@]}" exec -T postgres sh -c 'echo "$POSTGRES_DB"' | tr -d '\r')
  drill_db="${main_db}_restore_drill"
  psql_in "$main_db" "DROP DATABASE IF EXISTS ${drill_db}"
  psql_in "$main_db" "CREATE DATABASE ${drill_db}"
  echo "Khôi phục vào database tạm $drill_db..."
  "${COMPOSE[@]}" exec -T postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d '$drill_db' --no-owner --exit-on-error" < "$DB_FILE"
  echo "Kiểm tra dữ liệu trong bản sao lưu:"
  echo "  alembic_version:  $(psql_in "$drill_db" 'SELECT version_num FROM alembic_version')"
  for table in users document_batches uploaded_files audit_logs; do
    echo "  $table: $(psql_in "$drill_db" "SELECT count(*) FROM $table") dòng"
  done
  psql_in "$main_db" "DROP DATABASE ${drill_db}"
  echo "OK: diễn tập khôi phục thành công, đã xóa database tạm."
}

restore() {
  download "$1" --with-files
  echo "Dừng backend để không ai ghi dữ liệu trong lúc khôi phục..."
  "${COMPOSE[@]}" stop backend
  bash scripts/restore_db.sh "$DB_FILE" --yes
  echo "Khôi phục file chứng từ và ảnh đại diện..."
  "${COMPOSE[@]}" run --rm --no-deps -T backend tar xzf - -C /app < "$FILES_FILE"
  "${COMPOSE[@]}" start backend
  echo "Chờ backend sẵn sàng..."
  for _ in $(seq 1 36); do
    if "${COMPOSE[@]}" ps backend | grep -q healthy; then
      echo "OK: đã khôi phục bộ $(basename "$DB_FILE" .dump | sed 's/^db_//')."
      return 0
    fi
    sleep 5
  done
  echo "Backend chưa healthy, xem: docker compose -f docker-compose.yml logs backend" >&2
  return 1
}

case "${1:-}" in
  --list) list ;;
  --drill) drill "${2:-latest}" ;;
  "" | -h | --help) sed -n '2,13p' "$0" ;;
  *)
    if [[ "${2:-}" != --yes ]]; then
      echo "Khôi phục thật sẽ GHI ĐÈ dữ liệu hiện tại. Chạy lại: $0 $1 --yes (hoặc thử trước bằng --drill $1)" >&2
      exit 2
    fi
    restore "$1"
    ;;
esac

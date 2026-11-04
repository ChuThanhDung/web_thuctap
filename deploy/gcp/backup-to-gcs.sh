#!/usr/bin/env bash
# Sao lưu DB + file chứng từ rồi đẩy lên Cloud Storage, để vẫn còn bản sao khi mất máy ảo.
# Giữ 7 bản theo ngày (daily/) và 4 bản theo tuần (weekly/, bản của ngày Chủ nhật). Xóa theo SỐ LƯỢNG chứ không theo
# tuổi, nên nếu cron hỏng nhiều ngày thì các bản cũ vẫn còn.
#   GCS_BUCKET=gs://ten-bucket deploy/gcp/backup-to-gcs.sh
# Cron hằng ngày lúc 2 giờ sáng (crontab -e):
#   0 2 * * * GCS_BUCKET=gs://ten-bucket /opt/docusyncai/deploy/gcp/backup-to-gcs.sh >> /var/log/docusyncai/backup.log 2>&1
# Máy ảo cần quyền ghi bucket (scope devstorage.read_write). Bucket đặt ở us-west1/us-central1/us-east1 để nằm trong
# 5 GB miễn phí. Khôi phục: deploy/gcp/restore-from-gcs.sh.
# Biến tùy chọn: KEEP_DAILY (7), KEEP_WEEKLY (4), WEEKLY_DAY (7 = Chủ nhật, theo `date +%u`),
# BACKUP_DIR (bản trên máy, mặc định /var/backups/docusyncai).
set -euo pipefail

: "${GCS_BUCKET:?Đặt GCS_BUCKET, ví dụ gs://docusyncai-backup}"
GCS_BUCKET=${GCS_BUCKET%/}
KEEP_DAILY=${KEEP_DAILY:-7}
KEEP_WEEKLY=${KEEP_WEEKLY:-4}
WEEKLY_DAY=${WEEKLY_DAY:-7}
LOCAL_DIR=${BACKUP_DIR:-/var/backups/docusyncai}
cd "$(dirname "$0")/../.."

echo "== $(date '+%F %T') sao lưu"
# Bản trên máy chỉ để khôi phục nhanh; giữ 3 ngày cho đỡ tốn ổ 30 GB.
BACKUP_DIR=$LOCAL_DIR KEEP_DAYS=3 bash scripts/backup_db.sh

latest_db=$(ls -t "$LOCAL_DIR"/db_*.dump | head -1)
stamp=$(basename "$latest_db" .dump)
stamp=${stamp#db_}
latest_files="$LOCAL_DIR/storage_${stamp}.tar.gz"
[[ -f "$latest_files" ]] || { echo "Thiếu $latest_files" >&2; exit 1; }

gcloud storage cp "$latest_db" "$latest_files" "$GCS_BUCKET/daily/"
if [[ "$(date +%u)" == "$WEEKLY_DAY" ]]; then
  gcloud storage cp "$GCS_BUCKET/daily/db_${stamp}.dump" "$GCS_BUCKET/daily/storage_${stamp}.tar.gz" "$GCS_BUCKET/weekly/"
fi

prune() { # prune <thư mục> <số bản giữ lại>: xóa các bộ (db + storage) cũ hơn N bộ mới nhất
  local prefix=$1 keep=$2 old
  # Tên file chứa thời gian YYYYMMDD_HHMMSS nên sắp xếp theo tên là theo thời gian.
  old=$(gcloud storage ls "$GCS_BUCKET/$prefix/db_*.dump" 2>/dev/null | sort | head -n -"$keep" || true)
  for db in $old; do
    local s
    s=$(basename "$db" .dump)
    s=${s#db_}
    gcloud storage rm "$db" "$GCS_BUCKET/$prefix/storage_${s}.tar.gz" || true
  done
}
prune daily "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"

echo "Đã đẩy bộ $stamp lên $GCS_BUCKET ($(du -h "$latest_db" | cut -f1) DB, $(du -h "$latest_files" | cut -f1) file)."
echo "Hiện có: $(gcloud storage ls "$GCS_BUCKET/daily/db_*.dump" | wc -l) bản ngày, $(gcloud storage ls "$GCS_BUCKET/weekly/db_*.dump" 2>/dev/null | wc -l) bản tuần."

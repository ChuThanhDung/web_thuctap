#!/usr/bin/env bash
# Sao lưu DB + file chứng từ rồi đẩy lên Cloud Storage, để vẫn còn bản sao khi mất máy ảo.
#   GCS_BUCKET=gs://ten-bucket deploy/gcp/backup-to-gcs.sh
# Cron hằng ngày lúc 2 giờ sáng (crontab -e):
#   0 2 * * * GCS_BUCKET=gs://ten-bucket /opt/docusyncai/deploy/gcp/backup-to-gcs.sh >> /var/log/docusyncai-backup.log 2>&1
# Máy ảo cần quyền ghi bucket (xem deploy/gcp/README.md, bước 6). Bucket nên đặt lifecycle xóa bản cũ hơn 30 ngày.
set -euo pipefail

: "${GCS_BUCKET:?Đặt GCS_BUCKET, ví dụ gs://docusyncai-backup}"
cd "$(dirname "$0")/../.."
BACKUP_DIR=/var/backups/docusyncai KEEP_DAYS=7 scripts/backup_db.sh

latest_db=$(ls -t /var/backups/docusyncai/db_*.dump | head -1)
latest_files=$(ls -t /var/backups/docusyncai/storage_*.tar.gz | head -1)
gcloud storage cp "$latest_db" "$latest_files" "$GCS_BUCKET/$(date +%Y/%m)/"
echo "Đã đẩy $(basename "$latest_db") và $(basename "$latest_files") lên $GCS_BUCKET"

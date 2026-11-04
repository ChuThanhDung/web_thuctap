#!/usr/bin/env bash
# Cảnh báo qua email khi RAM hoặc ổ đĩa của máy ảo vượt ngưỡng (mặc định 85%). Thay cho Ops Agent của GCP
# (agent tốn 100–200 MB RAM, quá nặng cho e2-micro). Gửi bằng cấu hình SMTP sẵn có trong .env của backend.
# Mỗi loại cảnh báo gửi tối đa một lần mỗi 12 giờ để không spam.
# Cron mỗi 10 phút (crontab -e):
#   */10 * * * * ALERT_EMAIL=ban@vi.du /opt/docusyncai/deploy/gcp/check-resources.sh >> /var/log/docusyncai/resources.log 2>&1
# Biến tùy chọn: ALERT_EMAIL (mặc định SMTP_USER), MEM_THRESHOLD (85), DISK_THRESHOLD (85), ALERT_EVERY_HOURS (12).
set -euo pipefail

cd "$(dirname "$0")/../.."
MEM_THRESHOLD=${MEM_THRESHOLD:-85}
DISK_THRESHOLD=${DISK_THRESHOLD:-85}
ALERT_EVERY_HOURS=${ALERT_EVERY_HOURS:-12}
STATE_DIR=${ALERT_STATE_DIR:-/var/tmp/docusyncai-alerts}
mkdir -p "$STATE_DIR"

# RAM đã dùng = 100% - MemAvailable (phần cache hệ điều hành trả lại được không tính là dùng).
mem_pct=$(awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END {printf "%d", (t-a)*100/t}' /proc/meminfo)
swap_pct=$(awk '/^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2} END {if (t>0) printf "%d", (t-f)*100/t; else print 0}' /proc/meminfo)
disk_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')

send_alert() { # send_alert <loại> <tiêu đề> <nội dung>
  local kind=$1 subject=$2 body=$3 stamp="$STATE_DIR/$1"
  if [[ -f "$stamp" ]] && [[ -n "$(find "$stamp" -mmin -$((ALERT_EVERY_HOURS * 60)))" ]]; then
    echo "$(date '+%F %T') $kind vẫn vượt ngưỡng, đã báo trong ${ALERT_EVERY_HOURS} giờ qua"
    return
  fi
  # Gửi từ trong container backend: đã có Python và biến SMTP_* từ .env.
  if docker compose -f docker-compose.yml exec -T \
    -e ALERT_TO="${ALERT_EMAIL:-}" -e ALERT_SUBJECT="$subject" -e ALERT_BODY="$body" backend python - <<'PY'
import os, smtplib
from email.message import EmailMessage

user, password = os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASSWORD", "")
to = os.environ.get("ALERT_TO") or user
if not (user and password and to):
    raise SystemExit("Thiếu SMTP_USER/SMTP_PASSWORD hoặc ALERT_EMAIL")
msg = EmailMessage()
msg["From"] = os.environ.get("SMTP_FROM") or user
msg["To"] = to
msg["Subject"] = os.environ["ALERT_SUBJECT"]
msg.set_content(os.environ["ALERT_BODY"])
with smtplib.SMTP(os.environ.get("SMTP_HOST", "smtp.gmail.com"), int(os.environ.get("SMTP_PORT", "587")), timeout=20) as smtp:
    if os.environ.get("SMTP_TLS", "true").lower() != "false":
        smtp.starttls()
    smtp.login(user, password)
    smtp.send_message(msg)
PY
  then
    touch "$stamp"
    echo "$(date '+%F %T') đã gửi cảnh báo: $subject"
  else
    echo "$(date '+%F %T') KHÔNG gửi được cảnh báo: $subject" >&2
  fi
}

details="RAM: ${mem_pct}% (swap ${swap_pct}%), ổ đĩa /: ${disk_pct}%, máy: $(hostname), lúc $(date '+%d/%m/%Y %H:%M').

Xem nhanh:
  free -h; df -h /; docker stats --no-stream
  docker system df        # ảnh/volume Docker chiếm bao nhiêu
  docker image prune -af  # xóa image cũ không dùng"

if (( mem_pct >= MEM_THRESHOLD )); then
  send_alert mem "[DocuSyncAI] RAM máy ảo ${mem_pct}%" "$details"
fi
if (( disk_pct >= DISK_THRESHOLD )); then
  send_alert disk "[DocuSyncAI] Ổ đĩa máy ảo ${disk_pct}%" "$details"
fi

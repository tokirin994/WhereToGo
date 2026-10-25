#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ -n ${BACKUP_RCLONE_DEST:-} && -f "$RUNTIME/rclone.conf" ]] || { echo 'Configure and complete an off-site backup before installing the timer.' >&2; exit 1; }
[[ -f "$RUNTIME/backup-last-success.txt" ]] || { echo 'Run backup.sh successfully first.' >&2; exit 1; }
# Paths are fixed by the documented /opt/wheretogo installation; spaces are not supported in units.
[[ "$REPO" == /opt/wheretogo ]] || { echo 'Install the production checkout in /opt/wheretogo for the systemd units.' >&2; exit 1; }
cat >/etc/systemd/system/wheretogo-backup.service <<'UNIT'
[Unit]
Description=WhereToGo encrypted off-site database backup
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/bin/bash /opt/wheretogo/scripts/production/backup.sh
TimeoutStartSec=30min
Nice=10
UNIT
cat >/etc/systemd/system/wheretogo-backup.timer <<'UNIT'
[Unit]
Description=Daily WhereToGo backup at 03:30 Hong Kong time
[Timer]
OnCalendar=*-*-* 03:30:00 Asia/Hong_Kong
RandomizedDelaySec=5min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now wheretogo-backup.timer
echo 'Timer installed. Inspect systemctl status wheretogo-backup.service and journalctl -u wheretogo-backup.service regularly.'
echo 'A timer alone does not send email alerts or prove restorability; perform the documented fresh-server recovery drill.'

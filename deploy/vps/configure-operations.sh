#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/usr/sbin:/bin:/sbin
cd /opt/wheretogo/current
install -m 0700 host-firewall.sh /usr/local/sbin/wheretogo-firewall
cat > /etc/systemd/system/wheretogo-firewall.service <<'UNIT'
[Unit]
Description=WhereToGo host input firewall
After=network.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/wheretogo-firewall
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/wheretogo-backup.service <<'UNIT'
[Unit]
Description=Encrypted WhereToGo PostgreSQL and secret backup
Requires=docker.service
After=docker.service wheretogo-stack.service
[Service]
Type=oneshot
UMask=0077
Nice=10
ExecStart=/bin/bash /opt/wheretogo/current/backup.sh
UNIT
cat > /etc/systemd/system/wheretogo-backup.timer <<'UNIT'
[Unit]
Description=Daily encrypted WhereToGo backup
[Timer]
OnCalendar=daily
Persistent=true
Unit=wheretogo-backup.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable wheretogo-stack.service wheretogo-firewall.service wheretogo-backup.timer
systemctl start wheretogo-stack.service
systemctl start wheretogo-firewall.service
systemctl start wheretogo-backup.timer
systemctl start wheretogo-backup.service
printf '\nENCRYPTED BACKUP\n'
find /opt/wheretogo/backups -maxdepth 1 -name '*.tar.age' -type f -printf '%f %s bytes\n'
printf '\nSYSTEMD\n'
systemctl is-active docker wheretogo-stack.service wheretogo-firewall.service wheretogo-backup.timer
systemctl is-enabled docker wheretogo-stack.service wheretogo-firewall.service wheretogo-backup.timer
printf '\nMEMORY\n'
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
printf '\nNEXT BACKUP\n'
systemctl list-timers --no-pager wheretogo-backup.timer

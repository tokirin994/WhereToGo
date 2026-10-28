#!/usr/bin/env bash
# Run as root, pass the public key file to authorize. Private keys stay on Windows.
set -Eeuo pipefail
test "$(id -u)" = 0
key_file=${1:?Pass the read-only download public key file}
grep -Eq '^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$' "$key_file"
getent group wtgbackup >/dev/null || groupadd --system wtgbackup
id wtgbackup >/dev/null 2>&1 || useradd --system -M -d /var/lib/wheretogo-backup -g wtgbackup -s /bin/bash wtgbackup
passwd -l wtgbackup >/dev/null
install -d -m 0750 -o root -g wtgbackup /var/lib/wheretogo-backup /var/lib/wheretogo-backup/.ssh /opt/wheretogo/backups
install -o root -g root -m 0755 backup-export.py /opt/wheretogo/tools/backup-export.py
printf 'restrict,command="/usr/bin/python /opt/wheretogo/tools/backup-export.py" %s\n' "$(cat "$key_file")" > /var/lib/wheretogo-backup/.ssh/authorized_keys
chown root:wtgbackup /var/lib/wheretogo-backup/.ssh/authorized_keys
chmod 0640 /var/lib/wheretogo-backup/.ssh/authorized_keys
find /opt/wheretogo/backups -maxdepth 1 -type f -name '*.tar.age' -exec chgrp wtgbackup {} + -exec chmod 0640 {} +
# The provider image disables public-key login globally. Enable it only for
# this dedicated account, with no shell, forwarding, password or terminal.
if ! grep -q '^# WhereToGo read-only backup account$' /etc/ssh/sshd_config; then
 cp -p /etc/ssh/sshd_config /opt/wheretogo/incoming/sshd_config.before-backup-download
 cat >> /etc/ssh/sshd_config <<'SSH'

# WhereToGo read-only backup account
Match User wtgbackup
    PubkeyAuthentication yes
    PasswordAuthentication no
    AuthenticationMethods publickey
    AuthorizedKeysFile /var/lib/wheretogo-backup/.ssh/authorized_keys
    AllowTcpForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    ForceCommand /usr/bin/python /opt/wheretogo/tools/backup-export.py
Match all
SSH
 if ! /usr/sbin/sshd -t; then
  cp -p /opt/wheretogo/incoming/sshd_config.before-backup-download /etc/ssh/sshd_config
  echo 'SSH configuration validation failed; original configuration restored' >&2;exit 1
 fi
 systemctl reload sshd
fi
# CentOS 7 systemd 219 cannot parse timezone suffixes in OnCalendar.
test "$(date +%z)" = '+0000' || { echo 'Configure the timer in the server timezone before continuing' >&2;exit 1; }
# Produce a fresh archive ten minutes before the local midnight download.
install -d -m 0755 /etc/systemd/system/wheretogo-backup.timer.d
cat > /etc/systemd/system/wheretogo-backup.timer.d/download-schedule.conf <<'TIMER'
[Timer]
OnCalendar=
OnCalendar=*-*-* 15:50:00
Persistent=true
TIMER
systemctl daemon-reload
systemctl restart wheretogo-backup.timer
printf 'Read-only encrypted backup download configured; server backup at 23:50 Asia/Hong_Kong\n'

#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/usr/sbin:/bin:/sbin
cd /opt/wheretogo/current
test -f /opt/wheretogo/secrets/backup-recipient
test -x /opt/wheretogo/tools/age/age
install -d -m 0700 /opt/wheretogo/backups
name="$(date -u +%Y%m%dT%H%M%SZ).tar.age"
destination="/opt/wheretogo/backups/$name"
recipient=$(cat /opt/wheretogo/secrets/backup-recipient)
work=$(mktemp -d /opt/wheretogo/backups/staging.XXXXXXXX)
trap 'rm -f "$work/database.sql"; rmdir "$work"' EXIT
docker compose exec -T db pg_dumpall -U postgres > "$work/database.sql"
# The private age recovery key is intentionally excluded, even during initial setup.
tar --exclude='secrets/backup-private-key' -C "$work" -cf - database.sql -C /opt/wheretogo secrets -C /opt/wheretogo/current .env public-origin.txt | /opt/wheretogo/tools/age/age -r "$recipient" -o "$destination.partial"
mv "$destination.partial" "$destination"
printf 'Encrypted database backup: %s\n' "$destination"
# No automatic deletion: retention can be configured after an off-server copy is confirmed.

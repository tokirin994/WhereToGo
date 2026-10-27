#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
install -d -m 0700 /opt/wheretogo/secrets
install -d -m 0755 /opt/wheretogo/tools /opt/wheretogo/incoming
if ! test -x /opt/wheretogo/tools/age/age; then
 curl --proto '=https' --tlsv1.2 -sSfL --retry 2 --connect-timeout 20 --max-time 180 https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz -o /opt/wheretogo/incoming/age-v1.3.2.tar.gz
 tar -tzf /opt/wheretogo/incoming/age-v1.3.2.tar.gz | awk '$0 !~ /^age\// || $0 ~ /(^|\/)\.\.(\/|$)/ {bad=1} END {exit bad}'
 tar -xzf /opt/wheretogo/incoming/age-v1.3.2.tar.gz -C /opt/wheretogo/tools
 sha256sum /opt/wheretogo/incoming/age-v1.3.2.tar.gz > /opt/wheretogo/incoming/age-v1.3.2.sha256.record
fi
if ! test -f /opt/wheretogo/secrets/backup-recipient; then
 /opt/wheretogo/tools/age/age-keygen -o /opt/wheretogo/secrets/backup-private-key 2>/dev/null
 /opt/wheretogo/tools/age/age-keygen -y /opt/wheretogo/secrets/backup-private-key > /opt/wheretogo/secrets/backup-recipient
fi
printf 'Copy the private recovery key to protected off-server storage before removing it from this server.\n'

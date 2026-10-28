#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
export PATH=/usr/local/bin:/usr/bin:/usr/sbin:/bin:/sbin
python provision.py
chmod 0444 init-databases.sh
install -d -m 0700 /home/data/wheretogo/postgres
if getent group wtgbackup >/dev/null; then
 install -d -m 0750 -o root -g wtgbackup /opt/wheretogo/backups
else
 install -d -m 0700 /opt/wheretogo/backups
fi
docker compose config --quiet
if ! test -n "$(docker compose ps -q gateway)"; then docker compose up -d --no-build gateway; fi
export DOCKER_BUILDKIT=0
docker build --memory=768m --memory-swap=768m -t wheretogo-vps-postgis:16 -f Postgres.Dockerfile .
docker build --memory=768m --memory-swap=768m -t wheretogo-vps-identity:26.8.1 -f Identity.Dockerfile .
docker build --memory=512m --memory-swap=512m -t wheretogo-vps-travel:java8 --build-arg ARTIFACT=app/travel.jar -f Api.Dockerfile .
docker build --memory=512m --memory-swap=512m -t wheretogo-vps-ledger:java8 --build-arg ARTIFACT=app/ledger.jar -f Api.Dockerfile .
docker compose up -d db identity
# Import only creates a missing realm; update existing realms without resetting users.
bash configure-applications.sh
bash configure-registration.sh
docker compose up -d travel-api ledger-api
ready=0
for attempt in $(seq 1 90); do
 if docker compose exec -T gateway wget -q -O /dev/null http://travel-api:8080/api/v1/health && docker compose exec -T gateway wget -q -O /dev/null http://ledger-api:8090/actuator/health; then ready=1;break;fi
 sleep 3
done
test "$ready" = 1 || { printf 'APIs did not become ready; inspect private application logs.\n' >&2;exit 1; }
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < runtime-grants.sql
docker compose up -d --no-build gateway
if test -e /opt/wheretogo/current && ! test -L /opt/wheretogo/current; then printf 'Unexpected non-symlink deployment directory.\n' >&2;exit 1;fi
ln -sfn "$PWD" /opt/wheretogo/current
cat > /etc/systemd/system/wheretogo-stack.service <<'UNIT'
[Unit]
Description=WhereToGo portal, travel, ledger and identity
Requires=docker.service
After=docker.service network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/wheretogo/current
ExecStart=/usr/local/bin/docker compose up -d --no-build
ExecStop=/usr/local/bin/docker compose stop
TimeoutStartSec=240
TimeoutStopSec=180
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable wheretogo-stack.service
docker compose ps
printf '\nApplications started. Complete the public HTTPS and actual login checks before handover.\n'

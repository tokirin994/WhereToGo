#!/usr/bin/env bash
# Idempotent client registration. Preserve all users, credentials, realm sessions and legacy clients.
set -Eeuo pipefail
umask 077
work=$(mktemp -d)
container_work=/tmp/wtg-applications-$$
cleanup(){ docker compose exec -T identity rm -rf -- "$container_work" >/dev/null 2>&1 || true;rm -rf -- "$work"; }
trap cleanup EXIT
python configure-applications.py realm-template.json public-origin.txt "$work"
docker compose exec -T identity mkdir -m 700 "$container_work"
ready=0
for attempt in $(seq 1 45); do
 if docker compose exec -T identity bash -ec '
  /opt/keycloak/bin/kcadm.sh config credentials --config "$1/admin.json" --server http://localhost:8080/identity --realm master --user operator-admin --password "$(</run/secrets/identity-admin-password)" >/dev/null 2>&1
 ' bash "$container_work";then ready=1;break;fi
 sleep 3
done
test "$ready" = 1 || { echo 'Identity service is not ready for client registration' >&2;exit 1; }
for client in portal-web travel-web smartledger-web; do
 docker compose exec -T identity /opt/keycloak/bin/kcadm.sh get clients -r personal --config "$container_work/admin.json" -q "clientId=$client" --fields id > "$work/existing.json"
 id=$(python -c 'import json,sys;a=json.load(open(sys.argv[1]));print(a[0]["id"] if a else "")' "$work/existing.json")
 docker compose exec -T identity bash -ec 'cat > "$1/client.json"' bash "$container_work" < "$work/$client.json"
 if test -n "$id";then
  docker compose exec -T identity /opt/keycloak/bin/kcadm.sh update "clients/$id" -r personal --config "$container_work/admin.json" -f "$container_work/client.json"
 else
  docker compose exec -T identity /opt/keycloak/bin/kcadm.sh create clients -r personal --config "$container_work/admin.json" -f "$container_work/client.json" >/dev/null
 fi
 echo "Registered $client"
done

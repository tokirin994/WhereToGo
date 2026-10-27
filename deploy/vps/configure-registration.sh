#!/usr/bin/env bash
# Run from the release directory. Admin traffic stays inside the identity container.
set -Eeuo pipefail
umask 077
work=$(mktemp -d)
container_work=/tmp/wtg-registration-$$
cleanup() {
 docker compose exec -T identity rm -rf -- "$container_work" >/dev/null 2>&1 || true
 rm -rf -- "$work"
}
trap cleanup EXIT
docker compose exec -T identity mkdir -m 700 "$container_work"
ready=0
for attempt in $(seq 1 45); do
 if docker compose exec -T identity bash -ec '
  /opt/keycloak/bin/kcadm.sh config credentials --config "$1/admin.json" \
   --server http://localhost:8080/identity --realm master --user operator-admin \
   --password "$(</run/secrets/identity-admin-password)" >/dev/null 2>&1
 ' bash "$container_work"; then ready=1;break;fi
 sleep 3
done
test "$ready" = 1 || { echo 'Identity admin connection failed' >&2;exit 1; }
docker compose exec -T identity /opt/keycloak/bin/kcadm.sh get users/profile -r personal --config "$container_work/admin.json" > "$work/profile.json"
python configure-registration.py "$work/profile.json" "$work/updated.json"
docker compose exec -T identity bash -ec 'cat > "$1/profile.json"' bash "$container_work" < "$work/updated.json"
docker compose exec -T identity /opt/keycloak/bin/kcadm.sh update users/profile -r personal --config "$container_work/admin.json" -f "$container_work/profile.json"
docker compose exec -T identity /opt/keycloak/bin/kcadm.sh update realms/personal --config "$container_work/admin.json" \
 -s registrationAllowed=true -s registrationEmailAsUsername=false -s loginWithEmailAllowed=true \
 -s duplicateEmailsAllowed=false -s editUsernameAllowed=false -s bruteForceProtected=true
echo 'Registration enabled; optional name fields configured; existing accounts preserved'

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
# Account REST requires an account audience; keep API audiences separate.
docker compose exec -T identity /opt/keycloak/bin/kcadm.sh get clients -r personal --config "$container_work/admin.json" -q clientId=wheretogo-web --fields id > "$work/client.json"
portal_id=$(python -c 'import json,sys;print(json.load(open(sys.argv[1]))[0]["id"])' "$work/client.json")
docker compose exec -T identity /opt/keycloak/bin/kcadm.sh get "clients/$portal_id/protocol-mappers/models" -r personal --config "$container_work/admin.json" > "$work/mappers.json"
mapper_id=$(python -c 'import json,sys;print(next((m["id"] for m in json.load(open(sys.argv[1])) if m["name"]=="personal-account-audience"),""))' "$work/mappers.json")
cat > "$work/mapper.json" <<'JSON'
{"name":"personal-account-audience","protocol":"openid-connect","protocolMapper":"oidc-audience-mapper","config":{"included.client.audience":"account","access.token.claim":"true","id.token.claim":"false"}}
JSON
docker compose exec -T identity bash -ec 'cat > "$1/mapper.json"' bash "$container_work" < "$work/mapper.json"
if test -n "$mapper_id"; then
 docker compose exec -T identity /opt/keycloak/bin/kcadm.sh update "clients/$portal_id/protocol-mappers/models/$mapper_id" -r personal --config "$container_work/admin.json" -f "$container_work/mapper.json"
else
 docker compose exec -T identity /opt/keycloak/bin/kcadm.sh create "clients/$portal_id/protocol-mappers/models" -r personal --config "$container_work/admin.json" -f "$container_work/mapper.json" >/dev/null
fi
# Expose only the account client's own roles, not administration permissions.
mapper_id=$(python -c 'import json,sys;print(next((m["id"] for m in json.load(open(sys.argv[1])) if m["name"]=="personal-account-roles"),""))' "$work/mappers.json")
cat > "$work/mapper.json" <<'JSON'
{"name":"personal-account-roles","protocol":"openid-connect","protocolMapper":"oidc-usermodel-client-role-mapper","config":{"usermodel.clientRoleMapping.clientId":"account","claim.name":"resource_access.account.roles","jsonType.label":"String","multivalued":"true","access.token.claim":"true","id.token.claim":"false"}}
JSON
docker compose exec -T identity bash -ec 'cat > "$1/mapper.json"' bash "$container_work" < "$work/mapper.json"
if test -n "$mapper_id"; then
 docker compose exec -T identity /opt/keycloak/bin/kcadm.sh update "clients/$portal_id/protocol-mappers/models/$mapper_id" -r personal --config "$container_work/admin.json" -f "$container_work/mapper.json"
else
 docker compose exec -T identity /opt/keycloak/bin/kcadm.sh create "clients/$portal_id/protocol-mappers/models" -r personal --config "$container_work/admin.json" -f "$container_work/mapper.json" >/dev/null
fi
docker compose exec -T identity /opt/keycloak/bin/kcadm.sh update authentication/required-actions/UPDATE_EMAIL -r personal --config "$container_work/admin.json" -s enabled=true
# Imported seed accounts predate default-role assignment. Grant the normal self-service
# role already inherited by newly registered users; no administration role is granted.
for subject in $(python -c 'import json;print(" ".join(a["id"] for a in json.load(open("/opt/wheretogo/secrets/accounts-metadata.json"))))'); do
 docker compose exec -T identity /opt/keycloak/bin/kcadm.sh add-roles -r personal --config "$container_work/admin.json" --uid "$subject" --rolename default-roles-personal
 done
echo 'Registration enabled; optional name fields configured; existing accounts preserved'

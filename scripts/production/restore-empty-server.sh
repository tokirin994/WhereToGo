#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 && $# -eq 3 && "$3" == --empty-server ]] || { echo 'Usage: sudo bash scripts/production/restore-empty-server.sh <backup.tar.age> <age-private-key-file> --empty-server' >&2; exit 1; }
REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
RUNTIME="$REPO/.local/production"
for command in docker age python3; do command -v "$command" >/dev/null || { echo "Install $command first." >&2; exit 1; }; done
# This command is deliberately unsuitable for overwriting an existing production database.
if docker volume inspect wheretogo-production_postgres-data >/dev/null 2>&1; then
  echo 'Production PostgreSQL volume already exists. Restore to a fresh VM; this script never deletes an existing database.' >&2; exit 1
fi
[[ -f "$1" && -f "$2" ]] || { echo 'Backup and offline private key files must exist.' >&2; exit 1; }
umask 077
stage="$(mktemp -d /var/tmp/wheretogo-restore.XXXXXXXX)"
cleanup() { local status=$?; trap - EXIT; [[ "$stage" == /var/tmp/wheretogo-restore.* ]] && rm -rf -- "$stage"; exit "$status"; }
trap cleanup EXIT
age -d -i "$2" -o "$stage/backup.tar.gz" "$1"
python3 - "$stage" <<'PY'
import pathlib, sys, tarfile
if sys.version_info < (3, 12):
    raise SystemExit('Restore requires Python 3.12+ (Ubuntu 24.04) for safe extraction')
stage = pathlib.Path(sys.argv[1])
with tarfile.open(stage / 'backup.tar.gz') as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive member; restore stopped')
    archive.extractall(stage / 'content', filter='data')
PY
commit="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "$stage/content/manifest.json")"
[[ "$commit" == "$(git -C "$REPO" rev-parse HEAD)" ]] || { echo "Checkout the recorded commit first: $commit. No live data changed." >&2; exit 1; }
for database in travelatlas smartledger identity; do
  [[ -s "$stage/content/dumps/$database.dump" ]] || { echo "Missing dump for $database" >&2; exit 1; }
done
[[ -f "$stage/content/config/.env" && -f "$stage/content/config/secrets/credential-keyring.json" ]] || { echo 'Backup lacks required configuration/keyring.' >&2; exit 1; }
if [[ -e "$RUNTIME/secrets" || -e "$RUNTIME/.env" ]]; then
  echo 'Existing production configuration found. Use a genuinely fresh checkout/VM; no keys were overwritten.' >&2; exit 1
fi
mkdir -p -m 700 "$RUNTIME"
cp -R -- "$stage/content/config/." "$RUNTIME/"
chmod 700 "$RUNTIME" "$RUNTIME/secrets"
chmod 600 "$RUNTIME/.env"
chmod 644 "$RUNTIME"/secrets/*
chmod 755 "$RUNTIME/identity-import"
chmod 644 "$RUNTIME"/identity-import/*.json
mkdir -m 700 "$RUNTIME/backups"
source "$REPO/scripts/production/common.sh"
dc build --pull db
dc up -d --wait --wait-timeout 180 db
for database in travelatlas smartledger identity; do
  dc exec -T -u postgres db pg_restore -U postgres --dbname "$database" --clean --if-exists --exit-on-error <"$stage/content/dumps/$database.dump"
done
dc exec -T -u postgres db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <"$REPO/deploy/production/runtime-grants.sql"
echo 'Databases and credential keys restored. Application containers have not started.'
echo 'Confirm original hostnames point at this VM, then run scripts/production/start.sh.'
echo 'Remove the temporary copy of your offline age private key from the VM after recovery.'

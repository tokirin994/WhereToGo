#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
need docker; need age; need tar; need sha256sum; need flock
[[ $# -eq 0 || ( $# -eq 1 && "$1" == --local-only ) ]] || { echo 'Usage: backup.sh [--local-only]' >&2; exit 1; }
local_only=false
[[ ${1:-} != --local-only ]] || local_only=true
if ! "$local_only"; then
  [[ -n ${BACKUP_RCLONE_DEST:-} && -f "$RUNTIME/rclone.conf" ]] || { echo 'Configure an off-site rclone destination first, or explicitly use --local-only.' >&2; exit 1; }
  need rclone
fi
[[ ${BACKUP_KEEP_DAYS:-} =~ ^[0-9]+$ ]] && (( BACKUP_KEEP_DAYS >= 7 )) || { echo 'Keep at least seven days of local backups.' >&2; exit 1; }
exec 9>"$RUNTIME/backup.lock"
flock -n 9 || { echo 'Another backup is already running.' >&2; exit 1; }
umask 077
stage="$(mktemp -d "$RUNTIME/.backup.XXXXXXXX")"
partial=''
resume=()
cleanup() {
  local status=$?
  trap - EXIT
  if (( ${#resume[@]} )); then dc start "${resume[@]}" || status=1; fi
  [[ "$stage" == "$RUNTIME"/.backup.* ]] && rm -rf -- "$stage"
  [[ -z "$partial" || "$partial" != "$RUNTIME"/backups/*.part ]] || rm -f -- "$partial"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
# Validate public recipients before interrupting the apps. No backup private key belongs on this server.
age -R "$RUNTIME/backup-recipients.txt" -o "$stage/recipient-check.age" </dev/null
rm -- "$stage/recipient-check.age"
mkdir -m 700 "$stage/dumps" "$stage/config"
cp -- "$RUNTIME/.env" "$RUNTIME/backup-recipients.txt" "$stage/config/"
cp -R -- "$RUNTIME/secrets" "$RUNTIME/identity-import" "$stage/config/"
[[ ! -f "$RUNTIME/rclone.conf" ]] || cp -- "$RUNTIME/rclone.conf" "$stage/config/"
commit="$(git rev-parse HEAD)"
printf '{"format":1,"commit":"%s","createdAt":"%s","databaseMajor":16}\n' "$commit" "$(date -u +%FT%TZ)" >"$stage/manifest.json"
dc images >"$stage/images.txt"
# All three databases must describe the same set of accounts/records. Quiesce writers briefly.
mapfile -t running < <(dc ps --status running --services)
for service in travel-api ledger-api identity; do
  for active in "${running[@]}"; do [[ "$service" != "$active" ]] || resume+=("$service"); done
done
if (( ${#resume[@]} )); then dc stop "${resume[@]}"; fi
for database in travelatlas smartledger identity; do
  dc exec -T -u postgres db pg_dump -U postgres --format=custom --dbname "$database" >"$stage/dumps/$database.dump"
done
dc exec -T -u postgres db pg_dumpall -U postgres --globals-only >"$stage/dumps/roles-reference.sql"
# Restart as soon as dumps complete, before compression/encryption/upload.
if (( ${#resume[@]} )); then dc start "${resume[@]}"; resume=(); fi
name="wheretogo-$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:8}-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n').tar.age"
partial="$RUNTIME/backups/$name.part"
tar -C "$stage" -czf - . | age -R "$RUNTIME/backup-recipients.txt" -o "$partial"
output="$RUNTIME/backups/$name"
mv -- "$partial" "$output"
partial=''
(cd -- "$RUNTIME/backups" && sha256sum "$name") >"$output.sha256"
if ! "$local_only"; then
  destination="${BACKUP_RCLONE_DEST%/}"
  rclone --config "$RUNTIME/rclone.conf" copyto --immutable "$output" "$destination/$name"
  rclone --config "$RUNTIME/rclone.conf" copyto --immutable "$output.sha256" "$destination/$name.sha256"
fi
# Prune local files only after successful encryption and (unless explicitly skipped) off-site transfer.
find "$RUNTIME/backups" -maxdepth 1 -type f -name 'wheretogo-*.tar.age*' -mtime "+$BACKUP_KEEP_DAYS" -delete
printf '%s %s\n' "$(date -u +%FT%TZ)" "$name" >"$RUNTIME/backup-last-success.txt"
if "$local_only"; then
  echo "Encrypted local backup: $output (NOT an off-site backup; copy it to another device)."
else
  echo "Encrypted backup uploaded: $name. Keep the recipient private key on your offline device."
fi

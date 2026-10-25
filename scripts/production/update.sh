#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# == 1 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: sudo bash scripts/production/update.sh <reviewed-full-commit-sha>' >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'Checkout has local edits; review them before updating.' >&2; exit 1; }
if git symbolic-ref -q HEAD >/dev/null && [[ $(git rev-parse --abbrev-ref HEAD) != master ]]; then
  echo 'Use the production master checkout or a detached reviewed release.' >&2; exit 1
fi
# Download before making a backup; never follow an unreviewed branch head automatically.
git fetch origin master
git cat-file -e "$1^{commit}"
git merge-base --is-ancestor "$1" origin/master || { echo 'Commit is not reachable from origin/master.' >&2; exit 1; }
bash "$REPO/scripts/production/backup.sh"
git checkout --detach "$1"
bash "$REPO/scripts/production/start.sh"
echo 'Update applied. Keep the pre-update backup; database migrations may prevent a code-only rollback.'

#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
need docker; need curl
# Build in sequence to keep memory/CPU use bounded on the 2 OCPU free VM.
for service in db identity travel-api ledger-api; do dc build --pull "$service"; done
dc up -d db identity gateway
wait_https "https://$IDENTITY_HOST/realms/$IDENTITY_REALM/.well-known/openid-configuration"
dc up -d travel-api ledger-api
wait_https "https://$TRAVEL_API_HOST/api/v1/health"
wait_https "https://$LEDGER_API_HOST/actuator/health"
dc exec -T -u postgres db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <deploy/production/runtime-grants.sql
echo "Backends ready. Identity admin: https://$IDENTITY_HOST/admin/ (operator IP only)"
echo 'Create your real user and replace API_ALLOWED_SUBJECTS; the initial placeholder grants nobody access.'

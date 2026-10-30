#!/usr/bin/env bash
# Run once after V8 has been migrated; do not grant access to Flyway or credential tables.
set -Eeuo pipefail
cd /opt/wheretogo/current
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d travelatlas <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.travel_routes TO travel_app;
SQL

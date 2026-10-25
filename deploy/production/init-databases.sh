#!/usr/bin/env bash
set -Eeuo pipefail
# Executed by the official postgres entrypoint only when PGDATA is empty.
# psql variables quote passwords as SQL literals; secrets never appear in process arguments.
for role in travel_app travel_migrator ledger_app ledger_migrator identity_owner; do
  case "$role" in
    travel_app) file=travel-password ;;
    travel_migrator) file=travel-migration-password ;;
    ledger_app) file=ledger-password ;;
    ledger_migrator) file=ledger-migration-password ;;
    identity_owner) file=identity-password ;;
  esac
  export ROLE_PASSWORD="$(</run/secrets/"$file")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v role="$role" <<'SQL'
\getenv secret ROLE_PASSWORD
CREATE ROLE :"role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'secret';
SQL
  unset ROLE_PASSWORD
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE DATABASE travelatlas OWNER travel_migrator;
CREATE DATABASE smartledger OWNER ledger_migrator;
CREATE DATABASE identity OWNER identity_owner;
REVOKE ALL ON DATABASE travelatlas, smartledger, identity FROM PUBLIC;
GRANT CONNECT ON DATABASE travelatlas TO travel_app;
GRANT CONNECT ON DATABASE smartledger TO ledger_app;
SQL
for database in travelatlas smartledger identity; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" -c 'REVOKE ALL ON SCHEMA public FROM PUBLIC;'
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname travelatlas <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE, CREATE ON SCHEMA public TO travel_migrator;
GRANT USAGE ON SCHEMA public TO travel_app;
GRANT SELECT ON spatial_ref_sys TO travel_app;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname smartledger <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO ledger_migrator;
GRANT USAGE ON SCHEMA public TO ledger_app;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname identity <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO identity_owner;
SQL

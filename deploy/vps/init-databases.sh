#!/usr/bin/env bash
set -Eeuo pipefail
for role in travel_app travel_migrator ledger_app ledger_migrator identity_owner; do
 case "$role" in
  travel_app) file=travel-password ;;
  travel_migrator) file=travel-migration-password ;;
  ledger_app) file=ledger-password ;;
  ledger_migrator) file=ledger-migration-password ;;
  identity_owner) file=identity-password ;;
 esac
 export ROLE_PASSWORD="$(</run/secrets/"$file")"
 psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v role="$role" <<'SQL'
\getenv secret ROLE_PASSWORD
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'role', :'secret')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=:'role')
\gexec
SQL
 unset ROLE_PASSWORD
done
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<'SQL'
SELECT 'CREATE DATABASE travelatlas OWNER travel_migrator' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='travelatlas')
\gexec
SELECT 'CREATE DATABASE smartledger OWNER ledger_migrator' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='smartledger')
\gexec
SELECT 'CREATE DATABASE identity OWNER identity_owner' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='identity')
\gexec
REVOKE ALL ON DATABASE travelatlas, smartledger, identity FROM PUBLIC;
GRANT CONNECT ON DATABASE travelatlas TO travel_app;
GRANT CONNECT ON DATABASE smartledger TO ledger_app;
SQL
for database in travelatlas smartledger identity; do
 psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database" -c 'REVOKE ALL ON SCHEMA public FROM PUBLIC;'
done
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d travelatlas <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE, CREATE ON SCHEMA public TO travel_migrator;
GRANT USAGE ON SCHEMA public TO travel_app;
GRANT SELECT ON spatial_ref_sys TO travel_app;
SQL
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d smartledger <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO ledger_migrator;
GRANT USAGE ON SCHEMA public TO ledger_app;
SQL
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d identity <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO identity_owner;
SQL
touch /var/lib/postgresql/data/.wtg-databases-ready

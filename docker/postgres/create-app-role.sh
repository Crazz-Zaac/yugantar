#!/bin/bash
# Postgres init script — runs ONCE, on an empty data volume, as the superuser
# (docker-entrypoint-initdb.d). Creates the non-superuser RLS app role from env
# vars so the backend/worker can connect as a role that is SUBJECT to
# row-level security.
#
# Only runs on first DB init. For an EXISTING database, run the equivalent SQL
# by hand (see docker/postgres/rls-roles.sql).
set -euo pipefail

if [ -z "${POSTGRES_APP_USER:-}" ] || [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  echo "[rls] POSTGRES_APP_USER/PASSWORD not set; skipping app-role creation"
  exit 0
fi

echo "[rls] ensuring non-superuser app role '${POSTGRES_APP_USER}'"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set app_user="$POSTGRES_APP_USER" \
  --set app_pw="$POSTGRES_APP_PASSWORD" \
  --set db="$POSTGRES_DB" <<'EOSQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') THEN
    EXECUTE format('CREATE ROLE %I LOGIN', :'app_user');
  END IF;
END $$;
-- NOSUPERUSER / NOBYPASSRLS so the role is actually subject to RLS.
ALTER ROLE :"app_user" NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_pw';
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
-- No tables exist yet at first init; DEFAULT PRIVILEGES covers the tables the
-- migrations (run later as the owner) will create.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
EOSQL
echo "[rls] app role '${POSTGRES_APP_USER}' ready"

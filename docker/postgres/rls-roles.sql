-- Row-Level Security role provisioning.
--
-- OPTIONAL in Phase 0: no RLS policies exist yet, so the app keeps connecting
-- as POSTGRES_USER and these roles are unused. Run this (and point
-- POSTGRES_APP_USER at yugantar_app) when Phase 1 enables policies.
--
-- Run ONCE as a superuser / the DB owner. Passwords are passed as psql vars so
-- they are never committed:
--
--   psql "$DATABASE_URL" \
--     -v app_password="'CHANGE_ME_APP'" \
--     -v worker_password="'CHANGE_ME_WORKER'" \
--     -f docker/postgres/rls-roles.sql
--
-- BYPASSRLS requires superuser to grant.

\set ON_ERROR_STOP on

-- Runtime API role: SUBJECT to RLS (no BYPASSRLS, owns nothing).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yugantar_app') THEN
    CREATE ROLE yugantar_app LOGIN;
  END IF;
END $$;
ALTER ROLE yugantar_app WITH PASSWORD :app_password;

-- Background-worker role (Celery): trusted system context, bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yugantar_worker') THEN
    CREATE ROLE yugantar_worker LOGIN BYPASSRLS;
  END IF;
END $$;
ALTER ROLE yugantar_worker WITH PASSWORD :worker_password;

-- Both roles get DML on the application schema; DDL stays with the owner.
GRANT USAGE ON SCHEMA public TO yugantar_app, yugantar_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO yugantar_app, yugantar_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO yugantar_app, yugantar_worker;

-- Tables/sequences the owner creates later inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO yugantar_app, yugantar_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO yugantar_app, yugantar_worker;

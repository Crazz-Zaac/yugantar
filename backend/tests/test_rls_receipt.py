"""Integration test for receipt Row-Level Security (Phase 1).

Everything runs in one transaction that is rolled back, so nothing persists.
Because the app's DB role may be a superuser (which bypasses RLS entirely),
the test switches to a throwaway NON-superuser role to exercise the policy the
way the real yugantar_app role will. Skipped when no database is reachable.
"""

import os
import uuid

os.environ.setdefault("SECRET_KEY", "0" * 64)

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlmodel import Session  # noqa: E402


def _db_available() -> bool:
    try:
        from app.core.db import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_available(), reason="no database reachable")

_POLICY_SQL = [
    "ALTER TABLE receipt ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE receipt FORCE ROW LEVEL SECURITY",
    # Idempotent: drop first so the test works whether or not the migration
    # already created this policy (all inside the rolled-back transaction).
    "DROP POLICY IF EXISTS receipt_owner_or_privileged ON receipt",
    "CREATE POLICY receipt_owner_or_privileged ON receipt "
    "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid "
    "OR COALESCE(NULLIF(current_setting('app.is_privileged', true), '')::boolean, false)) "
    "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid "
    "OR COALESCE(NULLIF(current_setting('app.is_privileged', true), '')::boolean, false))",
]

_INS_USER = text(
    'INSERT INTO "user" (id, first_name, last_name, gender, hashed_password, '
    "phone, address, is_verified, is_approved, disabled, preferred_language, "
    "mfa_enabled, mfa_exempt, joined_at, created_at, updated_at) VALUES "
    "(:id,'T','T',CAST(:g AS genderenum),'x','1','x',true,true,false,'en',"
    "false,false,now(),now(),now())"
)
_INS_RECEIPT = text(
    "INSERT INTO receipt (id, date, user_id, content_hash, size_bytes, expires_at, "
    "ocr_status, created_at, updated_at) VALUES (:id, now(), :uid, :h, 0, "
    "now() + interval '1 day', 'pending', now(), now())"
)
_SET_PRINCIPAL = text(
    "SELECT set_config('app.user_id', :u, true), set_config('app.is_privileged', :p, true)"
)
_VISIBLE = text("SELECT id FROM receipt WHERE id IN (:ra, :rb)")


def test_receipt_rls_isolates_members():
    # Connect as the OWNER (superuser) so the setup inserts bypass RLS; the
    # policy is then exercised by SET ROLE to a non-superuser below. (The app
    # engine may itself be the RLS-subject role once POSTGRES_APP_USER is set.)
    from sqlalchemy import create_engine
    from app.core.config import settings

    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))
    a, b = uuid.uuid4(), uuid.uuid4()
    ra, rb = uuid.uuid4(), uuid.uuid4()

    with Session(engine) as s:
        try:
            gender = s.execute(
                text(
                    "SELECT enumlabel FROM pg_enum e JOIN pg_type t "
                    "ON e.enumtypid = t.oid WHERE t.typname = 'genderenum' LIMIT 1"
                )
            ).scalar()
            s.execute(_INS_USER, {"id": a, "g": gender})
            s.execute(_INS_USER, {"id": b, "g": gender})
            s.execute(_INS_RECEIPT, {"id": ra, "uid": a, "h": "h1"})
            s.execute(_INS_RECEIPT, {"id": rb, "uid": b, "h": "h2"})
            for stmt in _POLICY_SQL:
                s.execute(text(stmt))

            role = "rls_test_" + uuid.uuid4().hex[:8]
            s.execute(text(f'CREATE ROLE "{role}" NOLOGIN'))
            s.execute(text(f'GRANT SELECT ON receipt TO "{role}"'))
            s.execute(text(f'SET LOCAL ROLE "{role}"'))

            def visible(user_id: str, privileged: bool) -> set:
                s.execute(_SET_PRINCIPAL, {"u": user_id, "p": "true" if privileged else "false"})
                return {r for (r,) in s.execute(_VISIBLE, {"ra": ra, "rb": rb}).all()}

            assert visible(str(a), False) == {ra}
            assert visible(str(b), False) == {rb}
            assert visible("", True) == {ra, rb}
            assert visible("", False) == set()
        finally:
            s.rollback()

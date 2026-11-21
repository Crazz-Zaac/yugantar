"""Integration tests for deposit/loan Row-Level Security (Phase 2).

Status-dependent visibility. Runs in one rolled-back transaction under a
throwaway NON-superuser role (superusers bypass RLS). Skipped without a DB.
"""

import os
import uuid

os.environ.setdefault("SECRET_KEY", "0" * 64)

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlmodel import Session  # noqa: E402

_UID = "NULLIF(current_setting('app.user_id', true), '')::uuid"
_PRIV = "COALESCE(NULLIF(current_setting('app.is_privileged', true), '')::boolean, false)"
_DEPOSIT_READ = (
    f"user_id = {_UID} OR {_PRIV} "
    f"OR (verification_status = 'VERIFIED' AND {_UID} IS NOT NULL)"
)
_DEPOSIT_WRITE = f"user_id = {_UID} OR {_PRIV}"
_LOAN_READ = (
    f"user_id = {_UID} OR guarantor_user_id = {_UID} OR {_PRIV} "
    f"OR (status IN ('APPROVED', 'ACTIVE', 'PAID') AND {_UID} IS NOT NULL)"
)
_LOAN_WRITE = f"user_id = {_UID} OR guarantor_user_id = {_UID} OR {_PRIV}"


def _policy_sql(table: str, read: str, write: str) -> list[str]:
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY",
        f"CREATE POLICY {table}_select ON {table} FOR SELECT USING ({read})",
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK ({write})",
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE USING ({write}) WITH CHECK ({write})",
        f"CREATE POLICY {table}_delete ON {table} FOR DELETE USING ({write})",
    ]


def _db_available() -> bool:
    try:
        from app.core.db import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_available(), reason="no database reachable")

_INS_USER = text(
    'INSERT INTO "user" (id, first_name, last_name, gender, hashed_password, '
    "phone, address, is_verified, is_approved, disabled, preferred_language, "
    "joined_at, created_at, updated_at) VALUES (:id,'T','T',CAST(:g AS genderenum),"
    "'x','1','x',true,true,false,'en',now(),now(),now())"
)
_INS_DEPOSIT = text(
    "INSERT INTO deposit (id, created_at, updated_at, user_id, deposited_date, "
    "due_deposit_date, amount_paisa, deposit_type, verification_status) VALUES "
    "(:id, now(), now(), :uid, now(), now(), 1000, CAST(:dt AS deposittype), "
    "CAST(:vs AS depositverificationstatus))"
)
_INS_LOAN = text(
    "INSERT INTO loan (id, created_at, updated_at, user_id, guarantor_user_id, "
    "interest_rate, start_date, status, maturity_date, renewal_count, "
    "principal_paisa, penalties_paisa, accrued_interest_paisa, total_paid_paisa) "
    "VALUES (:id, now(), now(), :uid, :guid, 10.0, now(), CAST(:st AS loanstatus), "
    "now(), 0, 100000, 0, 0, 0)"
)
_SET_PRINCIPAL = text(
    "SELECT set_config('app.user_id', :u, true), set_config('app.is_privileged', :p, true)"
)


def _first_label(session: Session, enum_type: str) -> str:
    return session.execute(
        text(
            "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
            "WHERE t.typname = :n ORDER BY e.enumsortorder LIMIT 1"
        ),
        {"n": enum_type},
    ).scalar()


def _switch_to_unprivileged_role(session: Session) -> None:
    role = "rls_test_" + uuid.uuid4().hex[:8]
    session.execute(text(f'CREATE ROLE "{role}" NOLOGIN'))
    session.execute(text(f'GRANT SELECT ON deposit, loan TO "{role}"'))
    session.execute(text(f'SET LOCAL ROLE "{role}"'))


def _visible(session: Session, table: str, ids: dict, user_id: str, priv: bool) -> set:
    session.execute(_SET_PRINCIPAL, {"u": user_id, "p": "true" if priv else "false"})
    placeholders = ", ".join(f":{k}" for k in ids)
    rows = session.execute(
        text(f"SELECT id FROM {table} WHERE id IN ({placeholders})"), ids
    ).all()
    return {r for (r,) in rows}


def test_deposit_rls_status_visibility():
    from app.core.db import engine

    a, b = uuid.uuid4(), uuid.uuid4()
    ids = {
        "a_pending": uuid.uuid4(),
        "a_verified": uuid.uuid4(),
        "b_pending": uuid.uuid4(),
        "b_verified": uuid.uuid4(),
    }
    with Session(engine) as s:
        try:
            g = _first_label(s, "genderenum")
            dt = _first_label(s, "deposittype")
            s.execute(_INS_USER, {"id": a, "g": g})
            s.execute(_INS_USER, {"id": b, "g": g})
            rows = [
                (ids["a_pending"], a, "PENDING"),
                (ids["a_verified"], a, "VERIFIED"),
                (ids["b_pending"], b, "PENDING"),
                (ids["b_verified"], b, "VERIFIED"),
            ]
            for did, uid, vs in rows:
                s.execute(_INS_DEPOSIT, {"id": did, "uid": uid, "dt": dt, "vs": vs})
            for stmt in _policy_sql("deposit", _DEPOSIT_READ, _DEPOSIT_WRITE):
                s.execute(text(stmt))
            _switch_to_unprivileged_role(s)

            # Member A: own (both statuses) + anyone's VERIFIED, not B's PENDING.
            vis = _visible(s, "deposit", ids, str(a), False)
            assert vis == {ids["a_pending"], ids["a_verified"], ids["b_verified"]}
            # Privileged: everything.
            assert _visible(s, "deposit", ids, "", True) == set(ids.values())
            # Unauthenticated: nothing.
            assert _visible(s, "deposit", ids, "", False) == set()
        finally:
            s.rollback()


def test_loan_rls_status_and_guarantor_visibility():
    from app.core.db import engine

    a, b = uuid.uuid4(), uuid.uuid4()
    ids = {
        "a_pending": uuid.uuid4(),
        "b_active": uuid.uuid4(),
        "b_pending": uuid.uuid4(),
        "guaranteed_by_a": uuid.uuid4(),
    }
    with Session(engine) as s:
        try:
            g = _first_label(s, "genderenum")
            s.execute(_INS_USER, {"id": a, "g": g})
            s.execute(_INS_USER, {"id": b, "g": g})
            rows = [
                (ids["a_pending"], a, None, "PENDING"),
                (ids["b_active"], b, None, "ACTIVE"),
                (ids["b_pending"], b, None, "PENDING"),
                (ids["guaranteed_by_a"], b, a, "PENDING"),  # B's loan, A guarantees
            ]
            for lid, uid, guid, st in rows:
                s.execute(_INS_LOAN, {"id": lid, "uid": uid, "guid": guid, "st": st})
            for stmt in _policy_sql("loan", _LOAN_READ, _LOAN_WRITE):
                s.execute(text(stmt))
            _switch_to_unprivileged_role(s)

            # Member A: own pending + anyone's ACTIVE/PAID + loans A guarantees;
            # NOT B's unrelated PENDING.
            vis = _visible(s, "loan", ids, str(a), False)
            assert vis == {ids["a_pending"], ids["b_active"], ids["guaranteed_by_a"]}
            assert _visible(s, "loan", ids, "", True) == set(ids.values())
            assert _visible(s, "loan", ids, "", False) == set()
        finally:
            s.rollback()

"""Unit tests for the RLS request-context plumbing (no database required)."""

import os
import uuid

os.environ.setdefault("SECRET_KEY", "0" * 64)

from app.core import rls  # noqa: E402


def teardown_function():
    rls.clear_principal()


def test_principal_set_get_clear():
    assert rls.current_principal() is None
    token = rls.set_principal("abc", True)
    p = rls.current_principal()
    assert p is not None and p.user_id == "abc" and p.is_privileged is True
    rls.clear_principal(token)
    assert rls.current_principal() is None


def test_set_principal_coerces_types():
    u = uuid.uuid4()
    rls.set_principal(u, 1)
    p = rls.current_principal()
    assert p is not None
    assert p.user_id == str(u)
    assert p.is_privileged is True


class _FakeDialect:
    name = "postgresql"


class _FakeConn:
    dialect = _FakeDialect()

    def __init__(self):
        self.calls = []

    def execute(self, stmt, params=None):
        self.calls.append((str(stmt), params))
        return None


def test_apply_sets_empty_guc_when_unauthenticated():
    conn = _FakeConn()
    rls._apply_to_transaction(None, None, conn)
    assert len(conn.calls) == 1
    sql, params = conn.calls[0]
    assert "set_config('app.user_id'" in sql
    assert params == {"uid": "", "priv": "false"}


def test_apply_sets_principal_guc():
    rls.set_principal("u1", True)
    conn = _FakeConn()
    rls._apply_to_transaction(None, None, conn)
    _, params = conn.calls[0]
    assert params == {"uid": "u1", "priv": "true"}


def test_apply_skips_non_postgres():
    class _SqliteDialect:
        name = "sqlite"

    class _Conn:
        dialect = _SqliteDialect()

        def __init__(self):
            self.calls = []

        def execute(self, *a, **k):
            self.calls.append((a, k))

    rls.set_principal("u", False)
    conn = _Conn()
    rls._apply_to_transaction(None, None, conn)
    assert conn.calls == []

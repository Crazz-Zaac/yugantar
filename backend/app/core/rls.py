"""Row-Level Security (RLS) request context — Phase 0 plumbing.

Carries the authenticated principal (user id + privilege flag) from the request
into every database transaction as transaction-local GUCs:

    app.user_id        the caller's UUID ('' when unauthenticated)
    app.is_privileged  'true' for office bearers / admins, else 'false'

No policy reads these yet; this is the groundwork that Phase 1 policies will
build on. Values are written with ``set_config(key, value, is_local => true)``
— i.e. ``SET LOCAL`` — so they are scoped to the current transaction and never
leak across pooled connections. ``set_config`` takes bind parameters (plain
``SET`` does not), so the values can never be SQL-injected.
"""

import contextvars
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from sqlalchemy import event, text
from sqlalchemy.orm import Session as SASession

from app.core.config import settings


@dataclass(frozen=True)
class Principal:
    user_id: str
    is_privileged: bool


_principal: contextvars.ContextVar[Optional[Principal]] = contextvars.ContextVar(
    "rls_principal", default=None
)


def set_principal(user_id: "UUID | str", is_privileged: bool) -> contextvars.Token:
    """Record who the current request is acting as. Returns a token that
    ``clear_principal`` can use to restore the previous value."""
    return _principal.set(Principal(str(user_id), bool(is_privileged)))


# A trusted, non-user context (Celery tasks, maintenance scripts): no specific
# user, but allowed past member-level RLS restrictions. app.user_id stays empty
# so owner-only predicates still match nothing; app.is_privileged is true.
def set_system_principal() -> contextvars.Token:
    return _principal.set(Principal("", True))


def clear_principal(token: Optional[contextvars.Token] = None) -> None:
    if token is not None:
        try:
            _principal.reset(token)
            return
        except ValueError:
            # Token from a different context; fall through to a plain clear.
            pass
    _principal.set(None)


def current_principal() -> Optional[Principal]:
    return _principal.get()


def _apply_to_transaction(session, transaction, connection) -> None:
    """SQLAlchemy ``after_begin`` hook: stamp the principal onto the new tx."""
    if not settings.RLS_CONTEXT_ENABLED:
        return
    if connection.dialect.name != "postgresql":
        return
    principal = _principal.get()
    uid = principal.user_id if principal else ""
    priv = "true" if (principal and principal.is_privileged) else "false"
    connection.execute(
        text(
            "SELECT set_config('app.user_id', :uid, true), "
            "set_config('app.is_privileged', :priv, true)"
        ),
        {"uid": uid, "priv": priv},
    )


def register(session_class=SASession) -> None:
    """Attach the ``after_begin`` listener (idempotent)."""
    if not event.contains(session_class, "after_begin", _apply_to_transaction):
        event.listen(session_class, "after_begin", _apply_to_transaction)

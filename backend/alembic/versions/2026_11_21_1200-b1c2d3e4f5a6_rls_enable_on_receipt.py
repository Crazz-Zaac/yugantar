"""rls: enable row-level security on receipt (Phase 1)

Backstops the application-layer check in receipt_service.get_for_viewer: a
member may read/write only their own receipts; office bearers / admins and
trusted background tasks (app.is_privileged) may read/write all. The GUCs are
set per transaction by app/core/rls.py.

NULLIF guards the empty-string case (unauthenticated requests), since
''::uuid / ''::boolean would raise.

Revision ID: b1c2d3e4f5a6
Revises: a7b8c9d0e1f2
Create Date: 2026-11-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_POLICY = "receipt_owner_or_privileged"
_PREDICATE = (
    "user_id = NULLIF(current_setting('app.user_id', true), '')::uuid "
    "OR COALESCE(NULLIF(current_setting('app.is_privileged', true), '')::boolean, false)"
)


def upgrade() -> None:
    op.execute("ALTER TABLE receipt ENABLE ROW LEVEL SECURITY")
    # FORCE so the policy also applies to the table owner (the default app
    # connection today), not only to non-owner roles.
    op.execute("ALTER TABLE receipt FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {_POLICY} ON receipt "
        f"USING ({_PREDICATE}) WITH CHECK ({_PREDICATE})"
    )


def downgrade() -> None:
    op.execute(f"DROP POLICY IF EXISTS {_POLICY} ON receipt")
    op.execute("ALTER TABLE receipt NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE receipt DISABLE ROW LEVEL SECURITY")

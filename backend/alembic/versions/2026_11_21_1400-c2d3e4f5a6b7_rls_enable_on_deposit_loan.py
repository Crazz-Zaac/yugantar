"""rls: enable row-level security on deposit and loan (Phase 2)

Status-dependent visibility, mirroring services/visibility.py:
  - deposit: owner, privileged (office bearers/admins/background), or any
    member once the deposit is VERIFIED (the cooperative is transparent).
  - loan: owner, guarantor, privileged, or any member once the loan is
    APPROVED / ACTIVE / PAID.

Reads use that full predicate; writes are restricted to owner / guarantor /
privileged only (the public-status branch must NOT grant write access). The
app layer remains authoritative for writes — this is a backstop.

On-disk enum labels are the uppercase NAMES (VERIFIED, APPROVED, ...), as
stored by SQLAlchemy's Enum; confirmed against the database.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-11-21 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UID = "NULLIF(current_setting('app.user_id', true), '')::uuid"
_PRIV = "COALESCE(NULLIF(current_setting('app.is_privileged', true), '')::boolean, false)"

# The public-status branch requires an authenticated principal ({_UID} IS NOT
# NULL): verified deposits / public loans are visible to any *member*, but not
# to an unauthenticated session (where app.user_id is empty).
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

_COMMANDS = ("select", "insert", "update", "delete")


def _enable(table: str, read: str, write: str) -> list[str]:
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY",
        f"CREATE POLICY {table}_select ON {table} FOR SELECT USING ({read})",
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK ({write})",
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE "
        f"USING ({write}) WITH CHECK ({write})",
        f"CREATE POLICY {table}_delete ON {table} FOR DELETE USING ({write})",
    ]


def upgrade() -> None:
    for stmt in _enable("deposit", _DEPOSIT_READ, _DEPOSIT_WRITE):
        op.execute(stmt)
    for stmt in _enable("loan", _LOAN_READ, _LOAN_WRITE):
        op.execute(stmt)


def downgrade() -> None:
    for table in ("deposit", "loan"):
        for cmd in _COMMANDS:
            op.execute(f"DROP POLICY IF EXISTS {table}_{cmd} ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

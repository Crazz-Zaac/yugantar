"""add_finalized_to_policystatus_enum

Revision ID: c1125d4c2192
Revises: f79d56607a35
Create Date: 2026-03-01 15:19:17.709549+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c1125d4c2192'
down_revision: Union[str, Sequence[str], None] = 'f79d56607a35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add FINALIZED value to the policystatus PostgreSQL enum."""
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
    # so we need to commit the current transaction first.
    op.execute("COMMIT")
    op.execute("ALTER TYPE policystatus ADD VALUE IF NOT EXISTS 'FINALIZED' AFTER 'DRAFT'")


def downgrade() -> None:
    """PostgreSQL does not support removing values from enums.
    To fully revert, you would need to recreate the enum type.
    This is left as a no-op for safety."""
    pass

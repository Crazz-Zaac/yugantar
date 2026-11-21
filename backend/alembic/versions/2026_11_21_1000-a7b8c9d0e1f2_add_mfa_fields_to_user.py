"""add mfa fields to user

Revision ID: a7b8c9d0e1f2
Revises: c3f1a2b4d5e6
Create Date: 2026-11-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "c3f1a2b4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # mfa_enabled defaults to false for existing rows; drop the server default
    # afterwards so the application controls the value.
    op.add_column(
        "user",
        sa.Column(
            "mfa_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "user",
        sa.Column(
            "mfa_secret",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
    )
    op.add_column(
        "user",
        sa.Column("mfa_recovery_codes", sa.JSON(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("user", "mfa_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("user", "mfa_enrolled_at")
    op.drop_column("user", "mfa_recovery_codes")
    op.drop_column("user", "mfa_secret")
    op.drop_column("user", "mfa_enabled")

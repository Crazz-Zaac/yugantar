"""add mfa_exempt to user

Lets an admin exempt a user from the MFA requirement.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-11-21 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "mfa_exempt", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.alter_column("user", "mfa_exempt", server_default=None)


def downgrade() -> None:
    op.drop_column("user", "mfa_exempt")

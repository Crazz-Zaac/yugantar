"""policy change request

Revision ID: c3f1a2b4d5e6
Revises: b10689b48995
Create Date: 2026-11-20 15:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "c3f1a2b4d5e6"
down_revision: Union[str, Sequence[str], None] = "b10689b48995"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "policy_change_request",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("policy_type", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("policy_id", sa.Uuid(), nullable=False),
        sa.Column("policy_label", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("action", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("reason", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column("requested_by", sa.Uuid(), nullable=False),
        sa.Column("requested_by_name", sqlmodel.sql.sqltypes.AutoString(length=160), nullable=False),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_by_name", sqlmodel.sql.sqltypes.AutoString(length=160), nullable=True),
        sa.Column("decision_note", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["requested_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["decided_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_policy_change_request_id"), "policy_change_request", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_policy_change_request_policy_id"), "policy_change_request", ["policy_id"], unique=False
    )
    op.create_index(
        op.f("ix_policy_change_request_status"), "policy_change_request", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_policy_change_request_requested_by"), "policy_change_request", ["requested_by"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_policy_change_request_requested_by"), table_name="policy_change_request")
    op.drop_index(op.f("ix_policy_change_request_status"), table_name="policy_change_request")
    op.drop_index(op.f("ix_policy_change_request_policy_id"), table_name="policy_change_request")
    op.drop_index(op.f("ix_policy_change_request_id"), table_name="policy_change_request")
    op.drop_table("policy_change_request")

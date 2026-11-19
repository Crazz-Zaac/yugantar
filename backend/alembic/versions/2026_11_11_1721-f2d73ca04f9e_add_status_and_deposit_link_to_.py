"""add status and deposit link to loanpayment

Loan payments now require reviewer verification before they are credited
to the loan. Existing rows were already credited, so they are backfilled
as VERIFIED.

Revision ID: f2d73ca04f9e
Revises: e84181520bdb
Create Date: 2026-11-11 17:21:30.303082+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f2d73ca04f9e'
down_revision: Union[str, Sequence[str], None] = 'e84181520bdb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

loanpaymentstatus = postgresql.ENUM(
    'PENDING', 'VERIFIED', 'REJECTED', name='loanpaymentstatus', create_type=False
)


def upgrade() -> None:
    """Upgrade schema."""
    loanpaymentstatus.create(op.get_bind(), checkfirst=True)

    op.add_column('loanpayment', sa.Column('deposit_id', sa.Uuid(), nullable=True))
    # server_default backfills existing (already credited) payments as VERIFIED,
    # then is dropped so the application default (PENDING) applies.
    op.add_column(
        'loanpayment',
        sa.Column('status', loanpaymentstatus, nullable=False, server_default='VERIFIED'),
    )
    op.alter_column('loanpayment', 'status', server_default=None)
    op.add_column('loanpayment', sa.Column('verified_by', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True))
    op.add_column('loanpayment', sa.Column('verified_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_loanpayment_deposit_id'), 'loanpayment', ['deposit_id'], unique=False)
    op.create_index(op.f('ix_loanpayment_status'), 'loanpayment', ['status'], unique=False)
    op.create_foreign_key(
        'fk_loanpayment_deposit_id_deposit', 'loanpayment', 'deposit', ['deposit_id'], ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_loanpayment_deposit_id_deposit', 'loanpayment', type_='foreignkey')
    op.drop_index(op.f('ix_loanpayment_status'), table_name='loanpayment')
    op.drop_index(op.f('ix_loanpayment_deposit_id'), table_name='loanpayment')
    op.drop_column('loanpayment', 'verified_at')
    op.drop_column('loanpayment', 'verified_by')
    op.drop_column('loanpayment', 'status')
    op.drop_column('loanpayment', 'deposit_id')
    loanpaymentstatus.drop(op.get_bind(), checkfirst=True)

from sqlmodel import Relationship, Field
from sqlalchemy import Column, Enum as SqlEnum
from datetime import datetime, timezone
from typing import Optional, List
import uuid
from enum import Enum
from typing import TYPE_CHECKING
from decimal import Decimal

if TYPE_CHECKING:
    from .user_model import User
    from .deposit_model import Deposit
    from .policy.loan_policy import LoanPolicy
    from .loan_payment import LoanPayment


from .base import BaseModel
from .mixins.money import MoneyMixin


class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    PAID = "paid"


# Table to Loan issued to users
class Loan(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    policy_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="loanpolicy.policy_id", index=True
    )
    user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="user.id", index=True
    )

    # principal amount
    principal_paisa: int = Field(description="Original amount borrowed by the user")
    interest_rate: Decimal = Field(
        decimal_places=2, description="Interest rate applied to the loan"
    )
    penalties_paisa: int = Field(
        default=0.0,
        description="Total penalties incurred on the loan",
    )
    
    accrued_interest_paisa: int = Field(
        default=0.0,
        description="Total interest amount accrued on the loan",
    )
    total_paid_paisa: int = Field(
        description="Total loan amount including interest and penalties"
    )

    # time period to track loan
    start_date: datetime = Field(description="Loan start date")
    maturity_date: datetime = Field(description="Loan maturity date")

    status: LoanStatus = Field(
        sa_column=Column(
            SqlEnum(LoanStatus, name="loanstatus"),  # SQLAlchemy Enum
            nullable=False,
            server_default=LoanStatus.PENDING.value,
        ),
        description="Initial status of the loan",
    )

    # approval and rejection details
    approved_by: Optional[str] = Field(max_length=100, nullable=True)
    approved_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    rejected_by: Optional[str] = Field(max_length=100, nullable=True)
    rejected_at: Optional[datetime] = Field(nullable=True)
    rejection_reason: Optional[str] = Field(max_length=255, nullable=True)

    # when funds were released to user
    disbursed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when the loan funds were disbursed to the user",
    )
    collateral_details: Optional[str] = Field(max_length=255, nullable=True)

    # renewal tracking fields
    renewal_count: int = Field(
        default=0, description="Number of times the loan has been renewed"
    )
    original_loan_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="loan.id",
        description="Reference to the original loan if this loan is a renewal",
    )
    renewed_from_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="loan.id",
        description="Reference to the loan from which this loan was renewed",
    )
    max_renewals: Optional[int] = Field(
        default=None,
        description="Maximum number of renewals allowed for this loan",
    )

    # Relationships
    user: "User" = Relationship(back_populates="loans")
    deposits: List["Deposit"] = Relationship(back_populates="loan")
    policy: Optional["LoanPolicy"] = Relationship(back_populates="loans")
    payments: List["LoanPayment"] = Relationship(back_populates="loan")

    # Self-referential relationship for renewals
    parent_loan: Optional["Loan"] = Relationship(
        back_populates="renewed_loans",
        sa_relationship_kwargs=dict(
            remote_side="Loan.id",  # Reference the id field of Loan
            primaryjoin="Loan.original_loan_id==Loan.id",
        ),
    )
    renewed_loans: List["Loan"] = Relationship(
        back_populates="parent_loan",
        sa_relationship_kwargs=dict(
            primaryjoin="Loan.original_loan_id==Loan.id",
        ),
    )

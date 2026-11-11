from sqlmodel import Relationship, Field
from sqlalchemy import Enum as SqlEnum
from datetime import datetime, timezone
from typing import Optional, List
import uuid
from enum import Enum
from typing import TYPE_CHECKING
from decimal import Decimal

if TYPE_CHECKING:
    from .loan_model import Loan

from .base import BaseModel
from .mixins.money import MoneyMixin


class LoanPaymentType(str, Enum):
    PRINCIPAL = "principal"
    INTEREST = "interest"
    PENALTY = "penalty"  # optional, future-proof


class LoanPaymentStatus(str, Enum):
    """A payment only affects the loan's totals once a reviewer VERIFIES it."""

    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class LoanPayment(BaseModel, MoneyMixin, table=True):

    __table_args__ = {"extend_existing": True}

    loan_id: uuid.UUID = Field(foreign_key="loan.id", index=True)
    receipt_id: Optional[uuid.UUID] = Field(foreign_key="receipt.id", nullable=True)

    # Set when the payment was created as part of a smart deposit; its review
    # status then follows the deposit's verification.
    deposit_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="deposit.id", nullable=True, index=True
    )

    # amount_paisa is inherited from MoneyMixin
    # also provides: amount_rupees property, rupees_to_paisa() static method

    payment_type: LoanPaymentType

    status: LoanPaymentStatus = Field(default=LoanPaymentStatus.PENDING, index=True)
    verified_by: Optional[str] = Field(default=None, max_length=100, nullable=True)
    verified_at: Optional[datetime] = Field(default=None, nullable=True)

    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    loan: "Loan" = Relationship(back_populates="payments")

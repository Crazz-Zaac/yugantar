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


class LoanPayment(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    loan_id: uuid.UUID = Field(foreign_key="loan.id", index=True)
    receipt_id: Optional[uuid.UUID] = Field(foreign_key="receipt.id", nullable=True)

    # payment_amount is now inherited from MoneyMixin
    # the amount will be stored in the 'amount_paisa' field of MoneyMixin
    # amount: float = Field(gt=0)
    
    payment_type: LoanPaymentType

    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    loan: "Loan" = Relationship(back_populates="payments")

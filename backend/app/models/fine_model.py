from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional
from enum import Enum
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user_model import User
    from .deposit_model import Deposit

from .base import BaseModel
from .mixins.money import MoneyMixin

class FineType(str, Enum):
    DEPOSIT = "deposit"
    LOAN = "loan"
    OTHER = "other"


# Table to store fines imposed on users
class Fine(BaseModel, MoneyMixin, table=True):

    __table_args__ = {"extend_existing": True}

    user_id: Optional[uuid.UUID] = Field(foreign_key="user.id", index=True)
    deposit_id: Optional[uuid.UUID] = Field(foreign_key="deposit.id", nullable=True)
    loan_id: Optional[uuid.UUID] = Field(foreign_key="loan.id", nullable=True)
    receipt_id: Optional[uuid.UUID] = Field(foreign_key="receipt.id", nullable=True)
    
    # fine amount is inherited from MoneyMixin
    # the amount is stored in amount_paisa for precision
    
    fine_type: FineType = Field(default=FineType.OTHER)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    user: "User" = Relationship(back_populates="fines")
    deposit: Optional["Deposit"] = Relationship(back_populates="fine")

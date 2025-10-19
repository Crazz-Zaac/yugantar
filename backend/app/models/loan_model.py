from sqlmodel import Relationship, Field
from datetime import datetime
from typing import Optional, List
import uuid
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user_model import User
    from .deposit_model import Deposit

from .base import BaseModel



class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    PAID = "paid"


# Table to Loan issued to users
class Loan(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="user.id", index=True
    )
    amount: float = Field()
    interest_rate: float = Field()
    start_date: datetime = Field()
    end_date: datetime = Field()
    status: str = Field(max_length=50)
    approved_by: Optional[str] = Field(max_length=100, nullable=True)
    total_paid: float = Field(default=0.0)
    remaining_amount: float = Field(default=0.0)
    is_renewed: bool = Field(default=False)
    notes: Optional[str] = Field(max_length=255, nullable=True)

    # Relationships
    user: "User" = Relationship(back_populates="loans")
    deposits: List["Deposit"] = Relationship(back_populates="loan")

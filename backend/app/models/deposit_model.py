from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional, List

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from models import User, Loan, Receipt, Fine

from .base import BaseModel



class Deposit(BaseModel, table=True):
    user_id: int = Field(foreign_key="user.id", index=True)
    deposited_amount: float = Field()
    amount_to_be_deposited: float = Field()
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    loan_id: Optional[int] = Field(foreign_key="loan.id", nullable=True)
    receipt_screenshot: Optional[str] = Field(max_length=255, nullable=True)
    receipt_id: Optional[int] = Field(foreign_key="receipt.id", nullable=True)
    notes: Optional[str] = Field(max_length=255, nullable=True)
    
    # Relationships
    user: "User" = Relationship(back_populates="deposits")
    loan: Optional["Loan"] = Relationship(back_populates="deposits")
    deposits: List["Deposit"] = Relationship(back_populates="loan")
    receipt: Optional["Receipt"] = Relationship(back_populates="deposits")
    fine: Optional["Fine"] = Relationship(back_populates="deposit")


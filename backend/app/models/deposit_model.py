from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional, List
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user_model import User
    from .loan_model import Loan
    from .receipt_model import Receipt
    from .fine_model import Fine

from .base import BaseModel


class Deposit(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    deposited_amount: float = Field()
    amount_to_be_deposited: float = Field()
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[uuid.UUID] = Field(foreign_key="user.id", index=True)
    loan_id: Optional[uuid.UUID] = Field(foreign_key="loan.id", nullable=True)
    receipt_id: Optional[uuid.UUID] = Field(foreign_key="receipt.id", nullable=True)
    receipt_screenshot: Optional[str] = Field(max_length=255, nullable=True)
    notes: Optional[str] = Field(max_length=255, nullable=True)

    # Relationships
    loan: Optional["Loan"] = Relationship(back_populates="deposits")
    user: "User" = Relationship(back_populates="deposits")
    receipt: Optional["Receipt"] = Relationship(back_populates="deposits")
    fine: Optional["Fine"] = Relationship(
        back_populates="deposit", sa_relationship_kwargs={"uselist": False}
    )

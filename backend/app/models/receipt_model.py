from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional, List

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from models import User, Deposit

from .base import BaseModel

# Table to store receipts for each deposits from user
class Receipt(BaseModel, table=True):

    user_id: int = Field(foreign_key="user.id", index=True)
    receipt_screenshot: Optional[str] = Field(max_length=255, nullable=True)
    amount: float = Field()
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(max_length=255, nullable=True)

    # Relationships
    user: "User" = Relationship(back_populates="receipts")
    deposits: List["Deposit"] = Relationship(back_populates="receipt")
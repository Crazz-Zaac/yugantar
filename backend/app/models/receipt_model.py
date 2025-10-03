from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional

from app.models import BaseModel

# Table to store receipts for each deposits from user
class Receipt(BaseModel):

    user_id: int = Field(foreign_key="user.id", index=True)
    receipt_screenshot: Optional[str] = Field(max_length=255, nullable=True)
    amount: float = Field()
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(max_length=255, nullable=True)

    # Relationships
    user: "User" = Relationship(back_populates="receipts")
    deposits: List["Deposit"] = Relationship(back_populates="receipt")
from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from models import User, Deposit

from .base import BaseModel

# Table to store fines imposed on users
class Fine(BaseModel, table=True):

    fine_id: Optional[int] = Field(default=None, primary_key=True, index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    amount: float = Field()
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(max_length=255, nullable=True)

    # Relationships
    user: "User" = Relationship(back_populates="fines")
    deposit: Optional["Deposit"] = Relationship(back_populates="fine")
    
from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user_model import User
    from .deposit_model import Deposit

from .base import BaseModel


# Table to store fines imposed on users
class Fine(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    user_id: Optional[uuid.UUID] = Field(foreign_key="user.id", index=True)
    deposit_id: Optional[uuid.UUID] = Field(foreign_key="deposit.id", nullable=True)
    amount: float = Field()
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(max_length=255, nullable=True)

    # Relationships
    user: "User" = Relationship(back_populates="fines")
    deposit: Optional["Deposit"] = Relationship(back_populates="fine")

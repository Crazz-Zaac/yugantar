from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import JSON, Column

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import Deposit, Loan, Fine, Receipt


from .base import BaseModel


# Table to store user information
class User(BaseModel, table=True):

    user_id: Optional[int] = Field(default=None, index=True)
    full_name: str = Field(max_length=100)
    middle_name: Optional[str] = Field(max_length=100, nullable=True)
    last_name: str = Field(max_length=100)
    email: str = Field(max_length=100, unique=True, index=True)
    password: str = Field(max_length=255)
    password_repeat: str = Field(max_length=255)
    phone: str = Field(max_length=15)
    address: str = Field(max_length=255)
    roles: List[str] = Field(default=None, sa_column=Column(JSON))
    cooperative_roles: List[str] = Field(default=None, sa_column=Column(JSON))
    disabled: bool = Field(default=False)
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    deposits: List["Deposit"] = Relationship(back_populates="user")
    # transactions: List["Transaction"] = Relationship(back_populates="user")
    loans: List["Loan"] = Relationship(back_populates="user")
    # payments: List["Payment"] = Relationship(back_populates="user")
    # savings: List["Saving"] = Relationship(back_populates="user")
    fines: List["Fine"] = Relationship(back_populates="user")
    receipts: List["Receipt"] = Relationship(back_populates="user")

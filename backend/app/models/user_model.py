from sqlmodel import Relationship, Field, Enum as SqlEnum
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import JSON, Column
from enum import Enum
from typing import TYPE_CHECKING
from pydantic import EmailStr

if TYPE_CHECKING:
    from .deposit_model import Deposit
    from .loan_model import Loan
    from .fine_model import Fine
    from .receipt_model import Receipt


from .base import BaseModel


class AccessRole(str, Enum):
    USER = "user"  # regular user with standard access
    MODERATOR = "moderator"  # allow limited management access
    ADMIN = "admin"  # allow full access


class GenderEnum(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class CooperativeRole(str, Enum):
    SECRETARY = "secretary"
    TREASURER = "treasurer"
    PRESIDENT = "president"
    MEMBER = "member"


# Table to store user information
class User(BaseModel, table=True):
    __table_args__ = {"extend_existing": True}

    first_name: str = Field(max_length=100)
    middle_name: Optional[str] = Field(max_length=100, nullable=True)
    last_name: str = Field(max_length=100)
    gender: GenderEnum = Field(
        sa_column=Column(
            SqlEnum(GenderEnum, name="genderenum"),
            nullable=False,
            default=GenderEnum.OTHER,
        )
    )
    date_of_birth: Optional[datetime] = Field(default=None, nullable=True)

    email: EmailStr = Field(index=True, unique=True, nullable=True)
    hashed_password: str = Field(max_length=255)

    phone: str = Field(max_length=15)
    address: str = Field(max_length=255)

    cooperative_roles: List[CooperativeRole] = Field(
        sa_column=Column(JSON), default_factory=lambda: [CooperativeRole.MEMBER]
    )
    access_roles: List[AccessRole] = Field(
        sa_column=Column(JSON), default_factory=lambda: [AccessRole.USER]
    )
    # Indicates if the user's email is verified
    is_verified: bool = Field(default=False, nullable=False)

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

from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional
import uuid
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user_model import User
    from .loan_model import Loan
    from .receipt_model import Receipt
    from .fine_model import Fine
    from .policy.deposit_policy import DepositPolicy

from .base import BaseModel
from .mixins.money import MoneyMixin


class DepositVerificationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class DepositType(str, Enum):
    CURRENT = "current"
    ADVANCE = "advance"


class Deposit(BaseModel, MoneyMixin, table=True):
    __table_args__ = {"extend_existing": True}

    policy_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="depositpolicy.policy_id", index=True, nullable=True
    )

    # the deposited amount is now inherited from MoneyMixin
    # the amount is stored in amount_paisa for precision

    deposit_type: DepositType = Field(default=DepositType.CURRENT)

    # Clearer date naming
    deposited_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_deposit_date: datetime = Field(index=True)

    # Foreign keys
    receipt_id: Optional[uuid.UUID] = Field(foreign_key="receipt.id", nullable=True)

    # Additional fields
    # deposit verification status
    verification_status: DepositVerificationStatus = Field(
        default=DepositVerificationStatus.PENDING
    )
    verified_by: Optional[str] = Field(max_length=100, nullable=True)

    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, nullable=False)
    loan_id: Optional[uuid.UUID] = Field(foreign_key="loan.id", nullable=True)

    # Relationships
    loan: Optional["Loan"] = Relationship(back_populates="deposits")
    user: "User" = Relationship(back_populates="deposits")
    receipt: Optional["Receipt"] = Relationship(back_populates="deposits")
    fine: Optional["Fine"] = Relationship(
        back_populates="deposit", sa_relationship_kwargs={"uselist": False}
    )
    deposit_policy: Optional["DepositPolicy"] = Relationship(back_populates="deposits")

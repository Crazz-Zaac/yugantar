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


class DepositTiming(str, Enum):
    EARLY = "early"
    ON_TIME = "on_time"
    LATE = "late"


class DepositVerificationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class DepositType(str, Enum):
    CURRENT = "current"
    ADVANCE = "advance"


class Deposit(BaseModel, table=True):
    __table_args__ = {"extend_existing": True}

    policy_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="depositpolicy.policy_id", index=True, nullable=True
    )

    deposited_amount: float = Field(gt=0)

    deposit_type: DepositType = Field(default=DepositType.CURRENT)

    # Clearer date naming
    deposited_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_deposit_date: datetime = Field()

    deposit_timing: DepositTiming = Field(default=DepositTiming.LATE)

    # Foreign keys
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    loan_id: Optional[uuid.UUID] = Field(foreign_key="loan.id", nullable=True)
    receipt_id: Optional[uuid.UUID] = Field(foreign_key="receipt.id", nullable=True)

    # Additional fields from schema
    # deposit verification status
    verification_status: DepositVerificationStatus = Field(
        default=DepositVerificationStatus.PENDING
    )
    verified_by: Optional[str] = Field(max_length=100, nullable=True)

    # Relationships
    loan: Optional["Loan"] = Relationship(back_populates="deposits")
    user: "User" = Relationship(back_populates="deposits")
    receipt: Optional["Receipt"] = Relationship(back_populates="deposits")
    fine: Optional["Fine"] = Relationship(
        back_populates="deposit", sa_relationship_kwargs={"uselist": False}
    )
    deposit_policy: Optional["DepositPolicy"] = Relationship(back_populates="deposits")

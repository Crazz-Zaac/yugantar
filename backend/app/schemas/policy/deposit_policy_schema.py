from sqlmodel import SQLModel
from datetime import datetime, timezone
from typing import Optional
from enum import Enum
import uuid


class PolicyStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    VOID = "void"

# -----------------------------
# Create Schema
# -----------------------------
class DepositPolicyCreate(SQLModel):
    deposit_amount_threshold: float
    late_deposit_fine: float  # in percentage
    deposit_frequency_days: int
    
    effective_from: datetime = datetime.now(timezone.utc)
    effective_to: Optional[datetime] = None
    
    status : PolicyStatus = PolicyStatus.DRAFT
    is_occasional: bool = False
    
    created_by: Optional[str] = None


# -----------------------------
# Update Schema
# -----------------------------
class DepositPolicyUpdate(SQLModel):
    deposit_amount_threshold: Optional[float] = None
    late_deposit_fine: Optional[float] = None
    deposit_frequency_days: Optional[int] = None
    change_reason: str  # required for audit

    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None

    status: Optional[PolicyStatus] = None
    is_occasional: Optional[bool] = None

    updated_at: datetime = datetime.now(timezone.utc)
    updated_by: Optional[str] = None


# -----------------------------
# Read / Response Schema
# -----------------------------
class DepositPolicyResponse(SQLModel):
    policy_id: uuid.UUID
    deposit_amount_threshold: float
    late_deposit_fine: float  # in percentage
    deposit_frequency_days: int
    version: int

    effective_from: datetime
    effective_to: Optional[datetime]

    status: PolicyStatus
    is_occasional: bool

    created_by: Optional[str]
    created_at: Optional[datetime] = None

    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

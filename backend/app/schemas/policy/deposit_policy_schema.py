from sqlmodel import SQLModel
from datetime import datetime, timezone
from typing import Optional
from enum import Enum
import uuid
from decimal import Decimal

from app.models.policy.deposit_policy import DepositScheduleType
from app.models.policy.base_policy import PolicyStatus


# -----------------------------
# Create Schema
# -----------------------------
class DepositPolicyCreate(SQLModel):
    amount_paisa: Decimal
    late_deposit_fine: float  # in percentage

    schedule_type: DepositScheduleType = DepositScheduleType.MONTHLY_FIXED_DAY
    due_day_of_month: Optional[int] = None
    allowed_months: Optional[int] = None
    max_occurrences: Optional[int] = None

    status: PolicyStatus = PolicyStatus.DRAFT

    effective_from: datetime = datetime.now(timezone.utc)
    effective_to: Optional[datetime] = None

    created_by: Optional[str] = None


# -----------------------------
# Update Schema
# -----------------------------
class DepositPolicyUpdate(SQLModel):
    amount_paisa: Optional[Decimal] = None
    late_deposit_fine: Optional[float] = None  # in percentage

    schedule_type: Optional[DepositScheduleType] = None
    due_day_of_month: Optional[int] = None
    allowed_months: Optional[int] = None
    max_occurrences: Optional[int] = None

    status: Optional[PolicyStatus] = None

    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None

    updated_by: Optional[str] = None


# -----------------------------
# Read / Response Schema
# -----------------------------
class DepositPolicyResponse(SQLModel):
    policy_id: uuid.UUID
    amount_paisa: Decimal
    late_deposit_fine: float  # in percentage

    schedule_type: DepositScheduleType
    due_day_of_month: Optional[int] = None
    allowed_months: Optional[int] = None
    max_occurrences: Optional[int] = None

    status: PolicyStatus
    effective_from: datetime
    effective_to: Optional[datetime] = None

    created_by: Optional[str] = None
    created_at: datetime
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

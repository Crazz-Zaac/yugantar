from pydantic import model_validator
from sqlmodel import Field, SQLModel
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

    # default_factory: evaluated per request (a plain default would be fixed
    # at server start-up)
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_to: Optional[datetime] = None

    created_by: Optional[str] = None

    @model_validator(mode="after")
    def _schedule_is_complete(self):
        """Each schedule needs its own setting, or due dates can't be computed."""
        if self.schedule_type == DepositScheduleType.MONTHLY_FIXED_DAY:
            if not self.due_day_of_month or not 1 <= self.due_day_of_month <= 31:
                raise ValueError("A monthly policy needs a due day between 1 and 31.")
        elif self.schedule_type == DepositScheduleType.OCCASIONAL:
            if not self.allowed_months or self.allowed_months < 1:
                raise ValueError("An occasional policy needs the number of months allowed (at least 1).")
        return self


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
    signing_deadline: Optional[datetime] = None
    effective_from: datetime
    effective_to: Optional[datetime] = None

    created_by: Optional[str] = None
    created_at: datetime
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

from sqlmodel import SQLModel
from datetime import datetime, timezone
from typing import Optional
import uuid

# -----------------------------
# Create Schema
# -----------------------------
class DepositPolicyCreate(SQLModel):
    deposit_amount_threshold: float
    late_deposit_fine: float  # in percentage
    deposit_frequency_days: int
    effective_from: datetime = datetime.now(timezone.utc)
    effective_to: Optional[datetime] = None
    is_active: bool = True
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
    is_active: Optional[bool] = None
    is_occasional: Optional[bool] = None
    
# -----------------------------
# Read / Response Schema
# -----------------------------
class DepositPolicyResponse(SQLModel):
    policy_id: uuid.UUID
    deposit_amount_threshold: float
    late_deposit_fine: float    # in percentage
    deposit_frequency_days: int
    change_reason: str
    version: int
    effective_from: datetime
    effective_to: Optional[datetime]
    is_active: bool
    is_occasional: bool
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
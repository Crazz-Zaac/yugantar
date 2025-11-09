from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional
import uuid
from decimal import Decimal


# -----------------------------
# Create Schema
# -----------------------------
class LoanPolicyCreate(SQLModel):
    max_loan_amount: float
    min_loan_amount: float
    interest_rate: Decimal
    grace_period_days: int = 0
    max_renewals: Optional[int] = 0  
    requires_collateral: bool = False  
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_to: Optional[datetime] = None
    created_by: Optional[str] = None



# -----------------------------
# Update Schema
# -----------------------------
class LoanPolicyUpdate(SQLModel):
    max_loan_amount: Optional[float] = None
    min_loan_amount: Optional[float] = None
    interest_rate: Optional[Decimal] = None
    grace_period_days: Optional[int] = None
    max_renewals: Optional[int] = None  
    requires_collateral: Optional[bool] = None  
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    updated_by: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# -----------------------------
# Read / Response Schema
# -----------------------------
class LoanPolicyResponse(SQLModel):
    policy_id: uuid.UUID  # matches model's PK
    version: int
    max_loan_amount: float
    min_loan_amount: float
    interest_rate: Decimal
    grace_period_days: Optional[int]
    max_renewals: Optional[int]  
    requires_collateral: bool  
    is_active: bool
    is_occasional: bool
    effective_from: datetime
    effective_to: Optional[datetime]
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


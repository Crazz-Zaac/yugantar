from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional
import uuid
from decimal import Decimal
from enum import Enum


class PolicyStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    VOID = "void"


# -----------------------------
# Create Schema
# -----------------------------
class LoanPolicyCreate(SQLModel):
    max_loan_amount: Decimal
    min_loan_amount: Decimal
    interest_rate: Decimal
    
    grace_period_days: int = 0
    max_renewals: Optional[int] = 0
    requires_collateral: bool = False
    
    status: PolicyStatus = PolicyStatus.DRAFT
    
    emi_applicable: bool = False
    
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_to: Optional[datetime] = None
    created_by: Optional[str] = None


# -----------------------------
# Update Schema
# -----------------------------
class LoanPolicyUpdate(SQLModel):
    max_loan_amount: Optional[Decimal] = None
    min_loan_amount: Optional[Decimal] = None

    interest_rate: Optional[Decimal] = None
    grace_period_days: Optional[int] = None
    max_renewals: Optional[int] = None
    change_reason: str  # required for audit

    status: Optional[PolicyStatus] = None
    emi_applicable: bool 
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
    max_loan_amount: Decimal
    min_loan_amount: Decimal
    
    interest_rate: Decimal
    grace_period_days: Optional[int]
    max_renewals: Optional[int]
    requires_collateral: bool
    
    status: PolicyStatus
    emi_applicable: bool
    
    effective_from: datetime
    effective_to: Optional[datetime]
    
    created_by: Optional[str]
    updated_by: Optional[str] = None
    
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_encoders = {
            Decimal: lambda v: str(v),
        }

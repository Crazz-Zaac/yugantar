from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional
import uuid
from decimal import Decimal
from enum import Enum


class PolicyStatus(str, Enum):
    DRAFT = "draft"
    FINALIZED = "finalized"
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
    # One-off charge when a loan is issued, % of the loan amount
    service_charge_percent: Decimal = Field(default=Decimal("1.00"), ge=0, le=100)

    grace_period_days: int = 0
    max_renewals: Optional[int] = 0
    requires_collateral: bool = False

    status: PolicyStatus = PolicyStatus.DRAFT

    emi_applicable: bool = False

    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_to: Optional[datetime] = None
    # Custom wording (None/empty = generated automatically from the terms)
    statement_en: Optional[str] = Field(default=None, max_length=2000)
    statement_ne: Optional[str] = Field(default=None, max_length=3000)
    created_by: Optional[str] = None


# -----------------------------
# Update Schema
# -----------------------------
class LoanPolicyUpdate(SQLModel):
    max_loan_amount: Optional[Decimal] = None
    min_loan_amount: Optional[Decimal] = None

    interest_rate: Optional[Decimal] = None
    service_charge_percent: Optional[Decimal] = Field(default=None, ge=0, le=100)
    grace_period_days: Optional[int] = None
    max_renewals: Optional[int] = None
    change_reason: str  # required for audit

    status: Optional[PolicyStatus] = None
    emi_applicable: bool
    requires_collateral: Optional[bool] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    # Custom wording (None/empty = generated automatically from the terms)
    statement_en: Optional[str] = Field(default=None, max_length=2000)
    statement_ne: Optional[str] = Field(default=None, max_length=3000)
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
    service_charge_percent: Decimal = Decimal("1.00")
    grace_period_days: Optional[int]
    max_renewals: Optional[int]
    requires_collateral: bool

    status: PolicyStatus
    signing_deadline: Optional[datetime] = None
    emi_applicable: bool

    effective_from: datetime
    effective_to: Optional[datetime]
    statement_en: Optional[str] = None
    statement_ne: Optional[str] = None

    created_by: Optional[str]
    updated_by: Optional[str] = None

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_encoders = {
            Decimal: lambda v: str(v),
        }

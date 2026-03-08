from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
import uuid

from app.models.loan_model import LoanStatus


# ----------------------------
# Loan Application (user submits)
# ----------------------------
class LoanApplicationCreate(SQLModel):
    """What a member sends when applying for a loan."""

    policy_id: uuid.UUID = Field(description="Active loan policy to apply under")
    amount_rupees: Decimal = Field(
        gt=0,
        description="Requested principal amount in rupees",
    )
    term_months: int = Field(
        gt=0,
        le=120,
        description="Requested loan term in months",
    )
    purpose: str = Field(max_length=255, description="Purpose of the loan")
    collateral_details: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Collateral description if policy requires it",
    )
    notes: Optional[str] = Field(default=None, max_length=500)


# ----------------------------
# Treasurer fund verification
# ----------------------------
class LoanFundVerification(SQLModel):
    """Treasurer confirms cooperative has funds to cover this loan."""

    notes: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional notes about fund availability",
    )


# ----------------------------
# President approval / rejection
# ----------------------------
class LoanApprovalAction(SQLModel):
    """President approves or rejects the loan."""

    notes: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional notes from the president",
    )


class LoanRejectAction(SQLModel):
    """President rejects the loan with a reason."""

    rejection_reason: str = Field(
        max_length=500,
        description="Reason for rejecting the loan",
    )


# ----------------------------
# Response schemas
# ----------------------------
class LoanResponse(SQLModel):
    """Full loan detail returned to the client."""

    id: uuid.UUID
    policy_id: uuid.UUID
    user_id: uuid.UUID

    # Money fields – returned as rupees for the frontend
    principal_rupees: Decimal
    penalties_rupees: Decimal
    accrued_interest_rupees: Decimal
    total_paid_rupees: Decimal

    interest_rate: Decimal
    status: LoanStatus

    # Dates
    start_date: datetime
    maturity_date: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Approval / rejection
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    disbursed_at: Optional[datetime] = None

    # Extra
    collateral_details: Optional[str] = None
    renewal_count: int = 0
    max_renewals: Optional[int] = None

    # Applicant name (joined from user table)
    applicant_name: Optional[str] = None
    # Purpose stored in notes-like field during application
    purpose: Optional[str] = None

    # Treasurer fund verification
    fund_verified_by: Optional[str] = None
    fund_verified_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoanListResponse(SQLModel):
    loans: List[LoanResponse]
    total: int


# ----------------------------
# Loan calculator request/response
# ----------------------------
class LoanCalculatorRequest(SQLModel):
    """Frontend sends this to compute repayment estimates."""

    principal_rupees: Decimal = Field(gt=0)
    interest_rate: Decimal = Field(gt=0, description="Annual interest rate %")
    term_months: int = Field(gt=0, le=120)


class LoanCalculatorResponse(SQLModel):
    principal_rupees: Decimal
    interest_rate: Decimal
    term_months: int
    monthly_interest_rupees: Decimal
    total_interest_rupees: Decimal
    total_repayment_rupees: Decimal

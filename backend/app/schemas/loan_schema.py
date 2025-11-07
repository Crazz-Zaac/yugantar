from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY
from pydantic import field_validator
from decimal import Decimal

import uuid

from app.models.loan_model import LoanStatus

# ----------------------------
# Loan Schemas
# ----------------------------


class LoanBase(SQLModel):
    principal_amount: float = Field(
        ..., gt=0, description="Original amount borrowed by the user"
    )
    loan_amount: float = Field(
        ..., gt=0, description="Total loan amount including interest and penalties"
    )
    interest_rate: Decimal = Field(
        ..., gt=0, description="Interest rate applied to the loan"
    )
    total_paid: float = Field(
        default=0.0, ge=0, description="Total amount paid towards the loan"
    )
    penalties_incurred: float = Field(
        default=0.0, ge=0, description="Total penalties incurred on the loan"
    )
    interest_paid: float = Field(
        default=0.0, ge=0, description="Total interest amount paid by the user"
    )
    acrued_interest: float = Field(
        default=0.0, ge=0, description="Total interest amount accrued on the loan"
    )
    remaining_amount: float = Field(
        default=0.0, ge=0, description="Remaining amount to be paid on the loan"
    )

    # loan time period tracking
    start_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    maturity_date: Optional[datetime] = None
    loan_status: Optional[LoanStatus] = Field(default=LoanStatus.PENDING)

    # person who approved the loan
    approved_by: Optional[str] = None
    disbursed_date: Optional[datetime] = None
    collateral_details: Optional[str] = None

    # renewal tracking
    renewal_count: int = Field(
        default=0, ge=0, description="Number of times the loan has been renewed"
    )
    is_renewed: bool = Field(default=False)
    notes: Optional[str] = Field(default=None, max_length=255)

    @field_validator("start_date", "maturity_date")
    def ensure_utc(cls, value):
        if value and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @field_validator("maturity_date")
    def check_maturity_after_start(cls, value, info):
        start_date = info.data.get("start_date")
        if value and start_date and value <= start_date:
            raise ValueError("Maturity date must be after the start date.")
        return value

    @field_validator("remaining_amount")
    def validate_remaining_amount(cls, value, info):
        loan_amount = info.data.get("amount")
        if loan_amount is not None and value > loan_amount:
            raise ValueError("Remaining amount cannot be greater than the loan amount.")
        return value

    @field_validator("total_paid")
    def validate_total_paid(cls, value, info):
        loan_amount = info.data.get("amount")
        if loan_amount is not None and value > loan_amount:
            raise ValueError("Total paid cannot be greater than the loan amount.")
        return value

    @property
    def is_active(self) -> bool:
        return self.loan_status == LoanStatus.ACTIVE

    @property
    def is_paid_off(self) -> bool:
        return self.remaining_amount <= 0


class LoanCreate(LoanBase):
    user_id: uuid.UUID
    policy_id: uuid.UUID
    principal_amount: float
    start_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(default=None, max_length=255)


class LoanUpdate(SQLModel):
    principal_amount: Optional[float] = Field(default=None, gt=0)
    loan_amount: Optional[float] = Field(default=None, gt=0)
    interest_rate: Optional[float] = Field(default=None, gt=0)

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    loan_status: Optional[str] = None

    approved_by: Optional[str] = None
    disbursed_date: Optional[datetime] = None
    collateral_details: Optional[str] = None

    renewal_count: Optional[int] = None
    is_renewed: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=255)


class LoanResponse(LoanBase):
    loan_id: uuid.UUID
    user_id: uuid.UUID
    policy_id: uuid.UUID

    principal_amount: float
    loan_amount: float
    interest_rate: Decimal
    penalties_incurred: float
    interest_paid: float
    accrued_interest: float
    total_paid: float
    remaining_amount: float
    monthly_installment: float

    start_date: datetime
    maturity_date: datetime
    status: LoanStatus

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

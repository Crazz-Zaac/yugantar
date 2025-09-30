from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Dict
from enum import Enum
from datetime import datetime, timezone
import uuid

# ----------------------------
# Loan Schemas
# ----------------------------


class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    PAID = "paid"


class LoanBase(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: int
    amount: float = Field(..., gt=0)
    interest_rate: float = Field(..., gt=0)
    start_date: datetime
    end_date: datetime
    status: LoanStatus = Field(default=LoanStatus.PENDING)
    approved_by: Optional[str] = None
    total_paid: float = Field(default=0)
    remaining_amount: float = Field(default=0)
    is_renewed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(None, max_length=255)

    @field_validator("start_date", "end_date")
    def check_dates(cls, value):
        if isinstance(value, datetime):
            return value.replace(tzinfo=timezone.utc)
        return value

    @field_validator("remaining_amount")
    def check_remaining_amount(cls, value, values):
        if "amount" in values and value > values["amount"]:
            raise ValueError("Remaining amount cannot be greater than the loan amount.")
        return value


class LoanCreate(LoanBase):
    amount: float = Field(..., gt=0)
    interest_rate: float = Field(..., gt=0)
    start_date: datetime
    end_date: datetime
    is_renewed: bool = Field(default=False)
    status: LoanStatus = Field(default=LoanStatus.PENDING)
    notes: Optional[str] = Field(None, max_length=255)


class LoanUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    interest_rate: Optional[float] = Field(None, gt=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[LoanStatus] = None
    is_renewed: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=255)
    total_paid: Optional[float] = Field(None, gt=0)
    remaining_amount: Optional[float] = Field(None, gt=0)

from sqlmodel import SQLModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
import uuid
from pydantic import field_validator

# ----------------------------
# Loan Schemas
# ----------------------------


class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    PAID = "paid"


class LoanBase(SQLModel):
    user_id: int
    amount: float = Field(..., gt=0)
    interest_rate: float = Field(..., gt=0)
    start_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_date: datetime
    status: LoanStatus = Field(default=LoanStatus.PENDING)
    approved_by: Optional[str] = None
    total_paid: float = Field(default=0.0, ge=0)
    remaining_amount: float = Field(default=0.0, ge=0)
    is_renewed: bool = Field(default=False)
    notes: Optional[str] = Field(default=None, max_length=255)

    @field_validator("start_date", "end_date")
    def check_dates(cls, value):
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value
        return value

    @field_validator("end_date")
    def check_end_date_after_start_date(cls, value, info):
        start_date = info.data.get("start_date")
        if start_date and value and value <= start_date:
            raise ValueError("End date must be after start date.")
        return value

    @field_validator("remaining_amount")
    def check_remaining_amount(cls, value, info):
        amount = info.data.get("amount")
        if amount is not None and value > amount:
            raise ValueError("Remaining amount cannot be greater than the loan amount.")
        return value

    @field_validator("total_paid")
    def check_total_paid(cls, value, info):
        amount = info.data.get("amount")
        if amount is not None and value > amount:
            raise ValueError("Total paid cannot be greater than the loan amount.")
        return value

    @property
    def is_active(self) -> bool:
        return self.status == LoanStatus.ACTIVE

    @property
    def is_paid_off(self) -> bool:
        return self.remaining_amount <= 0

    @property
    def is_overdue(self) -> bool:
        return (self.status == LoanStatus.ACTIVE and 
                datetime.now(timezone.utc) > self.end_date and 
                self.remaining_amount > 0)

class LoanUpdate(SQLModel):
    amount: Optional[float] = Field(default=None, gt=0)
    interest_rate: Optional[float] = Field(default=None, gt=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[LoanStatus] = None
    approved_by: Optional[str] = None
    total_paid: Optional[float] = Field(default=None, ge=0)
    remaining_amount: Optional[float] = Field(default=None, ge=0)
    is_renewed: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=255)


class LoanResponse(LoanBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        

class LoanDB(LoanBase, table=False):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
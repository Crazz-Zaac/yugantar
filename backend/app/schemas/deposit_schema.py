from sqlmodel import SQLModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pydantic import field_validator
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY
import uuid

from app.models.deposit_model import DepositStatus
from app.models.policy.deposit_policy import DepositPolicy


# ----------------------------
# Deposit Schemas
# ----------------------------


class DepositBase(SQLModel):
    deposited_amount: float = Field(..., gt=0)
    amount_to_be_deposited: float = Field(..., gt=0)
    deposit_frequency_days: int = Field(..., ge=1)
    
    # Clearer date naming    
    deposited_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_deposit_date: datetime
    deposit_status: DepositStatus = Field(default=DepositStatus.LATE)
    
    late_deposit_fine: Optional[float] = Field(default=0.0, ge=0)
    is_paid: bool = Field(default=False)
    
    verified_by: Optional[str] = None
    
    # receipt details
    receipt_screenshot: Optional[str] = Field(
    default=None, description="path to the screenshot"
    )
    receipt_id: Optional[uuid.UUID] = None
    
    notes: Optional[str] = Field(default=None, max_length=255)

    @field_validator("late_deposit_fine")
    def validate_fine_amount(cls, value, info):
        if value > 0 and not info.data.get("due_deposit_date"):
            raise ValueError(
                "Fine amount cannot be greater than 0 if due deposit date is not set."
            )
        return value

    @field_validator("deposited_amount")
    def validate_amount(cls, value, info):
        amount_to_be_deposited = info.data.get("amount_to_be_deposited")
        if value < amount_to_be_deposited:
            raise ValueError(
                f"Deposited amount cannot be less than {amount_to_be_deposited}."
            )
        return value

    @field_validator("receipt_screenshot")
    def validate_receipt_screenshot(cls, value):
        # More logic to add later
        if value is None:
            raise ValueError("Please upload receipt screenshot.")
        if value and not value.lower().endswith((".png", ".jpg", ".jpeg")):
            raise ValueError(
                "Invalid file type. Only .png, .jpg, and .jpeg are allowed."
            )
        return value


class DepositCreate(DepositBase):
    deposit_amount: float = Field(..., gt=0)
    deposit_status: DepositStatus = Field(default=DepositStatus.LATE)


class DepositUpdate(SQLModel):
    deposited_amount: Optional[float] = Field(default=None, gt=0)
    deposited_date: Optional[datetime] = None
    deposit_status: Optional[DepositStatus] = None

    verified_by: Optional[str] = None
    receipt_screenshot: Optional[str] = None
    fine_amount: Optional[float] = Field(default=None, ge=0)
    is_paid: Optional[bool] = None

    notes: Optional[str] = Field(default=None, max_length=255)


class DepositResponse(DepositBase):
    id: uuid.UUID
    policy_id: Optional[uuid.UUID]
    user_id: uuid.UUID

    loan_id: Optional[uuid.UUID]
    receipt_id: uuid.UUID

    deposited_amount: float
    amount_to_be_deposited: float
    deposited_date: datetime
    due_deposit_date: datetime
    deposit_status: DepositStatus

    receipt_screenshot: Optional[str]
    verified_by: Optional[str]

    fine_amount: Optional[float]
    is_paid: bool

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

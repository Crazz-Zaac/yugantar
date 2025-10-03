from sqlmodel import SQLModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pydantic import field_validator

import uuid



# ----------------------------
# Deposit Schemas
# ----------------------------


class DepositStatus(str, Enum):
    EARLY = "early"
    ON_TIME = "on_time"
    LATE = "late"


class DepositBase(SQLModel):
    receipt_screenshot: Optional[str] = Field(
        default=None, description="path to the screenshot"
    )
    receipt_id: int = Field(default_factory=lambda: int(uuid.uuid4().int) & (1<<31)-1)
    deposited_amount: float = Field(..., gt=0)
    amount_to_be_deposited: float = Field(..., gt=0)
    deposited_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_deposit_date: datetime
    status: DepositStatus = Field(default=DepositStatus.LATE)
    fine_amount: float = Field(default=0.0, ge=0)
    is_paid: bool = Field(default=False)
    verified_by: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=255)

    @field_validator("fine_amount")
    def validate_fine_amount(cls, value, info):
        if value > 0 and not info.data.get("due_deposit_date"):
            raise ValueError(
                "Fine amount cannot be greater than 0 if due deposit date is not set."
            )
        return value

    @field_validator("deposited_amount")
    def validate_amount(cls, value, info):
        amount_to_be_deposited = info.data.get("amount_to_be_deposited")
        if amount_to_be_deposited is not None and value < amount_to_be_deposited:
            raise ValueError(f"Deposited amount must be at least {amount_to_be_deposited}.")
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

    @property
    def is_late(self) -> bool:
        return self.deposited_date > self.due_deposit_date

    @property
    def is_early(self) -> bool:
        return self.deposited_date < self.due_deposit_date

    @property
    def is_on_time(self) -> bool:
        return self.deposited_date == self.due_deposit_date

class DepositCreate(DepositBase):
    amount: float = Field(..., gt=0)
    status: DepositStatus = Field(default=DepositStatus.LATE)

class DepositUpdate(SQLModel):
    deposited_amount: Optional[float] = Field(default=None, gt=0)
    deposited_date: Optional[datetime] = None
    status: Optional[DepositStatus] = None
    notes: Optional[str] = Field(default=None, max_length=255)
    receipt_screenshot: Optional[str] = None
    fine_amount: Optional[float] = Field(default=None, ge=0)
    is_paid: Optional[bool] = None


class DepositResponse(DepositBase):
    id: int
    created_at: datetime
    updated_at: datetime
    user_id: int

    class Config:
        from_attributes = True
        

class DepositDB(DepositBase, table=False):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
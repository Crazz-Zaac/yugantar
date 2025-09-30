from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Dict
from enum import Enum
from datetime import datetime, timezone
import uuid



# ----------------------------
# Deposit Schemas
# ----------------------------


class DepositStatus(str, Enum):
    EARLY = "early"
    ON_TIME = "on_time"
    LATE = "late"


class DepositBase(BaseModel):
    receipt_screenshot: Optional[str] = Field(
        None, description="path to the screenshot"
    )
    receipt_id: int = Field(default_factory=lambda: int(uuid.uuid4()))
    deposited_amount: float = Field(..., gt=0)
    amount_to_be_deposited: float = Field(..., gt=0)
    deposited_date: datetime
    due_deposit_date: datetime
    status: DepositStatus = Field(default=DepositStatus.LATE)
    fine_amount: float = Field(0.0, gt=0)
    is_paid: bool = Field(default=False)
    verified_by: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=255)

    @field_validator("fine_amount")
    def validate_fine_amount(cls, value):
        if value > 0 and not value.get("due_deposit_date"):
            raise ValueError(
                "Fine amount cannot be greater than 0 if due deposit date is not set."
            )
        return value

    @field_validator("amount")
    def validate_amount(cls, value, values):
        amount_to_be_deposited = values.get("amount_to_be_deposited")
        if amount_to_be_deposited is not None and value <= amount_to_be_deposited:
            raise ValueError(f"Amount must be at least {amount_to_be_deposited}.")
        return value

    @field_validator("receipt_screenshot")
    def validate_receipt_screenshot(cls, value):
        # more logic to add later
        if value is None:
            raise ValueError("Please upload receipt screenshot.")
        if value and not value.endswith((".png", ".jpg", ".jpeg")):
            raise ValueError(
                "Invalid file type. Only .png, .jpg, and .jpeg are allowed."
            )
        return value
    @property
    def is_late(self) -> bool:
        self.status == DepositStatus.LATE
        return self.deposited_date > self.due_deposit_date

    @property
    def is_early(self) -> bool:
        self.status == DepositStatus.EARLY
        return self.deposited_date < self.due_deposit_date

    @property
    def is_on_time(self) -> bool:
        self.status == DepositStatus.ON_TIME
        return self.deposited_date == self.due_deposit_date


class DepositCreate(DepositBase):
    amount: float = Field(..., gt=0)
    deposited_date: datetime
    receipt_screenshot: Optional[str] = None
    receipt_id: int = Field(default_factory=lambda: int(uuid.uuid4()))
    status: DepositStatus = Field(default=DepositStatus.LATE)
    notes: Optional[str] = Field(None, max_length=255)


class DepositUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    deposited_date: Optional[datetime] = None
    status: Optional[DepositStatus] = None
    notes: Optional[str] = Field(None, max_length=255)


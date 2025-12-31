from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone
from pydantic import model_validator, field_validator
import uuid
from decimal import Decimal

from app.models.deposit_model import DepositTiming
from app.models.deposit_model import DepositType
from app.models.deposit_model import DepositVerificationStatus


# ----------------------------
# Deposit Schemas
# ----------------------------


class DepositBase(SQLModel):
    deposited_amount: Decimal
    amount_to_be_deposited: Optional[int] = None
    deposit_frequency_days: Optional[int] = None

    # Clearer date naming
    deposited_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_deposit_date: datetime
    deposit_status: DepositTiming = Field(default=DepositTiming.LATE)

    late_deposit_fine: Optional[float] = Field(default=0.0, ge=0)

    verified_by: Optional[str] = None

    # this will not be stored in DB, just for API purposes
    receipt_screenshot: Optional[str] = None

    # receipt details
    receipt_id: Optional[uuid.UUID] = None

    # deposited amount is in rupees for API
    @classmethod
    def from_orm(cls, obj, update=None):
        return cls(
            **obj.__dict__,
            deposited_amount=(
                obj.amount_rupees if obj.amount_rupees is not None else Decimal(0)
            )
        )

    @model_validator(mode="before")
    def set_policy_values(cls, values):
        """Set deposit_frequency_days and late_deposit_fine from policy if policy_id is provided."""
        policy = values.get("deposit_policy")
        if policy:
            values["deposit_frequency_days"] = policy.deposit_frequency_days
            values["late_deposit_fine"] = policy.late_deposit_fine
            values["amount_to_be_deposited"] = policy.deposit_amount_threshold
        return values

    @field_validator("receipt_screenshot", mode="before")
    def validate_receipt_screenshot(cls, value):
        if value is None:
            raise ValueError("Please upload receipt screenshot.")
        if value and not value.lower().endswith((".png", ".jpg", ".jpeg")):
            raise ValueError(
                "Invalid file type. Only .png, .jpg, and .jpeg are allowed."
            )
        return value


class DepositCreate(DepositBase):
    deposit_status: DepositTiming = Field(default=DepositTiming.LATE)
    verification_status: DepositVerificationStatus = Field(
        default=DepositVerificationStatus.PENDING
    )
    deposit_type: DepositType = Field(default=DepositType.CURRENT)


class DepositUserUpdate(SQLModel):
    deposited_amount: Optional[int] = Field(default=None, gt=0)
    receipt_screenshot: Optional[str] = None

class DepositModeratorUpdate(SQLModel):
    verification_status: DepositVerificationStatus
    verified_by: Optional[str] = None

class DepositResponse(DepositBase):
    id: uuid.UUID
    policy_id: Optional[uuid.UUID]

    user_id: uuid.UUID
    loan_id: Optional[uuid.UUID]
    receipt_id: uuid.UUID
    receipt_screenshot: Optional[str]

    deposited_amount: Decimal
    amount_to_be_deposited: int
    deposited_date: datetime
    due_deposit_date: datetime

    deposit_status: DepositTiming
    deposit_type: DepositType

    verified_by: Optional[str]
    verifcation_status: DepositVerificationStatus

    fine_amount: Optional[int]

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

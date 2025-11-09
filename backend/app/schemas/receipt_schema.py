from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid
from pydantic import BaseModel, field_validator

# ----------------------------
# Receipt Schemas
# ----------------------------


class ReceiptBase(SQLModel):
    user_id: int
    deposit_id: Optional[int] = Field(default=None, gt=0)
    receipt_screenshot: Optional[str] = Field(default=None, max_length=255)
    amount: float = Field(..., gt=0)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(default=None, max_length=255)

    @field_validator("receipt_screenshot")
    def validate_receipt_screenshot(cls, value):
        # Allow None for optional field, only validate if value is provided
        if value is not None:
            if not value.lower().endswith((".png", ".jpg", ".jpeg")):
                raise ValueError(
                    "Invalid file type. Only .png, .jpg, and .jpeg are allowed."
                )
        return value

    @field_validator("amount")
    def validate_amount(cls, value):
        if value <= 0:
            raise ValueError("Amount must be greater than 0.")
        return value

    @property
    def has_screenshot(self) -> bool:
        return self.receipt_screenshot is not None

    @property
    def is_recent(self) -> bool:
        """Check if receipt is from the last 7 days"""
        return (datetime.now(timezone.utc) - self.date).days <= 7


class ReceiptCreate(ReceiptBase):
    pass
    
class ReceiptUpdate(SQLModel):
    deposit_id: Optional[int] = Field(default=None, gt=0)
    receipt_screenshot: Optional[str] = Field(default=None, max_length=255)
    amount: Optional[float] = Field(default=None, gt=0)
    date: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=255)

    @field_validator("receipt_screenshot")
    def validate_receipt_screenshot(cls, value):
        if value is not None:
            if not value.lower().endswith((".png", ".jpg", ".jpeg")):
                raise ValueError(
                    "Invalid file type. Only .png, .jpg, and .jpeg are allowed."
                )
        return value

class ReceiptResponse(ReceiptBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Schema for database operations
class ReceiptDB(ReceiptBase, table=False):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
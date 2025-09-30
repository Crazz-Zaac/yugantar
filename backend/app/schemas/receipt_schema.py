from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Dict
from enum import Enum
from datetime import datetime, timezone
import uuid


class ReceiptBase(BaseModel):
    receipt_id: int = Field(default_factory=lambda: int(uuid.uuid4()))
    user_id: int
    deposit_id: Optional[int] = Field(None, gt=0)
    receipt_screenshot: Optional[str] = Field(None, max_length=255)
    amount: float
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(None, max_length=255)


    @field_validator("receipt_screenshot")
    def validate_receipt_screenshot(cls, value):
        if value is None:
            raise ValueError("Please upload receipt screenshot.")
        if value and not value.endswith((".png", ".jpg", ".jpeg")):
            raise ValueError(
                "Invalid file type. Only .png, .jpg, and .jpeg are allowed."
            )
        return value

class ReceiptCreate(ReceiptBase):
    amount: float = Field(..., gt=0)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(None, max_length=255)
    user_id: int
    receipt_screenshot: Optional[str] = Field(None, max_length=255)
    
class ReceiptUpdate(BaseModel):
    receipt_id: Optional[int] = Field(None, gt=0)
    user_id: Optional[int] = Field(None, gt=0)
    receipt_screenshot: Optional[str] = Field(None, max_length=255)
    amount: Optional[float] = Field(None, gt=0)
    date: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = Field(None, max_length=255)
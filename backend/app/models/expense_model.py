"""
Expenses the cooperative pays (meetings, AGM, gifts, office, bank charges…),
recorded by the Treasurer and approved by the President.

Only APPROVED, non-voided expenses count in the Financial Reports; pending
ones are listed there separately. Amounts are integer paisa. A mistaken entry is voided (with a reason), never
deleted, so the record stays complete. Reports count non-voided expenses by
the day they were spent (Nepal calendar day).
"""

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from app.models.base import BaseModel


class ExpenseCategory(str, Enum):
    MEETING = "meeting"
    AGM = "agm"
    GIFT = "gift"
    OFFICE = "office"  # stationery, printing, rent
    BANK_CHARGES = "bank_charges"
    TRANSPORT = "transport"
    OTHER = "other"


class ExpenseStatus(str, Enum):
    PENDING = "pending"  # recorded, awaiting the President
    APPROVED = "approved"  # counts in the Financial Reports
    REJECTED = "rejected"  # not counted; the reason is kept


class Expense(BaseModel, table=True):
    __tablename__ = "expense"
    __table_args__ = {"extend_existing": True}

    amount_paisa: int = Field(gt=0)
    category: str = Field(max_length=30, index=True)
    spent_on: date = Field(index=True)  # the day it was paid (NPT)
    description: Optional[str] = Field(default=None, max_length=255, nullable=True)

    recorded_by: uuid.UUID = Field(index=True)
    recorded_by_name: str = Field(max_length=200)

    # Approval by the President (the Secretary when the President recorded it)
    status: str = Field(default=ExpenseStatus.PENDING.value, max_length=20, index=True,
                        sa_column_kwargs={"server_default": "pending"})
    reviewed_by: Optional[uuid.UUID] = Field(default=None, nullable=True)
    reviewed_by_name: Optional[str] = Field(default=None, max_length=200, nullable=True)
    reviewed_at: Optional[datetime] = Field(default=None, nullable=True)
    review_note: Optional[str] = Field(default=None, max_length=255, nullable=True)

    voided: bool = Field(default=False, index=True)
    voided_at: Optional[datetime] = Field(default=None, nullable=True)
    voided_by_name: Optional[str] = Field(default=None, max_length=200, nullable=True)
    void_reason: Optional[str] = Field(default=None, max_length=255, nullable=True)

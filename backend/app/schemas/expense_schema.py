from sqlmodel import SQLModel, Field
from typing import Optional
from sqlalchemy import Column, String
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.expense_model import ExpenseType

# ----------------------------
# Expense Schemas
# ----------------------------


class ExpenditureBase(SQLModel):
    amount: float = Field(..., gt=0)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    description: Optional[str] = Field(default=None, max_length=255)
    expense_type: ExpenseType = Field(
        sa_column=Column(ARRAY(String)), default_factory=lambda: ExpenseType.OTHER.value
    )
    notes: Optional[str] = Field(default=None, max_length=255)

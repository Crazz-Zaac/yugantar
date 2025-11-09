from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional
from enum import Enum
from sqlalchemy import Column, String

from .base import BaseModel


class ExpenseType(str, Enum):
    GIFT = "gift"
    AGM = "agm"
    OTHER = "other"


class ExpenditureModel(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    amount: float = Field()
    expense_type: ExpenseType = Field(
        sa_column=Column(String), default_factory=lambda: ExpenseType.OTHER.value
    )
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    description: Optional[str] = Field(max_length=255, nullable=True)

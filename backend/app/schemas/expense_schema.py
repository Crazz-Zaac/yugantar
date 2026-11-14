import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.expense_model import ExpenseCategory


class ExpenseCreate(BaseModel):
    amount_rupees: Decimal = Field(gt=0, le=Decimal("100000000"), decimal_places=2)
    category: ExpenseCategory
    spent_on: date
    description: Optional[str] = Field(default=None, max_length=255)

    @field_validator("description", mode="before")
    @classmethod
    def _strip(cls, v):
        return (v.strip() or None) if isinstance(v, str) else v

    @model_validator(mode="after")
    def _other_needs_description(self):
        if self.category == ExpenseCategory.OTHER and not (self.description and len(self.description) >= 3):
            raise ValueError("Say what an 'Other' expense was for.")
        return self


class ExpenseVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


class ExpenseReject(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


class ExpenseOut(BaseModel):
    id: uuid.UUID
    amount_rupees: Decimal
    category: str
    spent_on: date
    description: Optional[str]
    recorded_by_name: str
    created_at: datetime
    status: str  # pending | approved | rejected
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    can_review: bool = False  # the viewer may approve / reject it now
    voided: bool
    voided_at: Optional[datetime]
    voided_by_name: Optional[str]
    void_reason: Optional[str]


class ExpenseList(BaseModel):
    items: list[ExpenseOut]
    total_rupees: Decimal  # approved, not voided
    pending_rupees: Decimal  # awaiting approval, not voided
    by_category: dict[str, Decimal]  # approved, not voided
    can_record: bool
    can_approve: bool  # the viewer approves expenses (President / Secretary backup)

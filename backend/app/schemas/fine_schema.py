from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional
from decimal import Decimal
import uuid


from app.models.fine_model import FineType, Fine

# ----------------------------
# Fine Schemas
# ----------------------------


class FineBase(SQLModel):
    user_id: Optional[uuid.UUID] = None
    deposit_id: Optional[uuid.UUID] = None
    loan_id: Optional[uuid.UUID] = None
    receipt_id: Optional[uuid.UUID] = None

    amount: Decimal
    fine_type: FineType = Field(default=FineType.OTHER)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @classmethod
    def from_orm(cls, obj, update=None):
        return cls(
            **obj.__dict__,
            amount=(obj.amount_rupees if obj.amount_rupees is not None else Decimal(0))
        )


class FineResponse(FineBase):
    id: uuid.UUID

    user_id: Optional[uuid.UUID]
    deposit_id: Optional[uuid.UUID]
    loan_id: Optional[uuid.UUID]
    receipt_id: Optional[uuid.UUID]

    amount: Decimal
    fine_type: FineType
    date: datetime

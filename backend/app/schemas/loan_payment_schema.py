from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal
import uuid

from app.models.loan_payment import LoanPaymentType, LoanPaymentStatus


# ----------------------------
# Loan Payment Schemas
# ----------------------------


class LoanPaymentCreate(SQLModel):
    """Schema for creating a new loan payment."""

    loan_id: uuid.UUID
    payment_type: LoanPaymentType
    amount: Decimal = Field(gt=0, description="Payment amount in rupees")
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # optional receipt info (e.g. from OCR)
    receipt_id: Optional[uuid.UUID] = None
    transaction_reference: Optional[str] = None


class LoanPaymentUpdate(SQLModel):
    """Schema for updating an existing loan payment (before verification)."""

    amount: Optional[Decimal] = Field(default=None, gt=0)
    payment_type: Optional[LoanPaymentType] = None
    date: Optional[datetime] = None
    receipt_id: Optional[uuid.UUID] = None


class LoanPaymentReview(SQLModel):
    """Reviewer decision on a pending loan payment."""

    status: LoanPaymentStatus  # VERIFIED or REJECTED


class LoanPaymentResponse(SQLModel):
    """Schema for loan payment responses."""

    id: uuid.UUID
    loan_id: uuid.UUID
    receipt_id: Optional[uuid.UUID]
    deposit_id: Optional[uuid.UUID] = None
    payment_type: LoanPaymentType
    status: LoanPaymentStatus
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    amount_paisa: int
    date: datetime
    created_at: datetime
    updated_at: Optional[datetime]

    @property
    def amount_rupees(self) -> Decimal:
        return Decimal(self.amount_paisa) / Decimal(100)

    class Config:
        from_attributes = True


class LoanPaymentListResponse(SQLModel):
    """Paginated list of loan payments."""

    payments: List[LoanPaymentResponse]
    total: int

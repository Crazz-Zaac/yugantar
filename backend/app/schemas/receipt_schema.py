from sqlmodel import SQLModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
import uuid


# ----------------------------
# Receipt Schemas
# ----------------------------


class ReceiptDuplicate(SQLModel):
    """Another deposit that used the same image or bank reference."""

    deposit_id: uuid.UUID
    user_id: uuid.UUID
    match: str  # "same_image" | "same_reference"


class ReceiptResponse(SQLModel):
    """Receipt metadata for the uploader and reviewers."""

    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    uploaded_at: datetime
    expires_at: datetime
    image_available: bool

    ocr_status: str
    ocr_amount: Optional[Decimal] = None  # rupees
    ocr_charge: Optional[Decimal] = None  # rupees
    ocr_date: Optional[datetime] = None
    ocr_reference: Optional[str] = None

    # Present when the receipt is linked to a deposit
    deposit_id: Optional[uuid.UUID] = None
    submitted_amount: Optional[Decimal] = None  # rupees, as submitted by the member
    submitted_date: Optional[datetime] = None
    amount_differs_from_ocr: bool = False
    date_differs_from_ocr: bool = False

    duplicates: List[ReceiptDuplicate] = []

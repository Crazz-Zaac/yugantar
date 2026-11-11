from sqlmodel import Relationship, Field
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user_model import User
    from .deposit_model import Deposit

from .base import BaseModel


# Table to store receipts for each deposits from user
class Receipt(BaseModel, table=True):

    __table_args__ = {"extend_existing": True}

    # Uploaded voucher image. One row per upload; linked to at most one deposit.
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[uuid.UUID] = Field(foreign_key="user.id", index=True)

    # Stored image (see app.core.receipt_storage). file_key is cleared when
    # the image is purged after RECEIPT_RETENTION_DAYS; metadata is kept.
    file_key: Optional[str] = Field(default=None, max_length=255, nullable=True)
    content_hash: str = Field(max_length=64, index=True)  # sha256 of uploaded bytes
    size_bytes: int = Field(default=0)
    expires_at: datetime = Field(index=True)
    image_deleted_at: Optional[datetime] = Field(default=None, nullable=True)

    # What OCR read (server-side, so it can be compared with what the member
    # submitted). ocr_status: pending | completed | failed
    ocr_status: str = Field(default="pending", max_length=20)
    reference: Optional[str] = Field(default=None, max_length=64, nullable=True)
    # reference normalised for duplicate matching (O/Q->0, I/L->1, uppercase)
    reference_key: Optional[str] = Field(default=None, max_length=64, index=True, nullable=True)
    ocr_amount_paisa: Optional[int] = Field(default=None, nullable=True)
    ocr_charge_paisa: Optional[int] = Field(default=None, nullable=True)
    ocr_date: Optional[datetime] = Field(default=None, nullable=True)

    # Relationships
    user: "User" = Relationship(back_populates="receipts")
    deposits: List["Deposit"] = Relationship(back_populates="receipt")

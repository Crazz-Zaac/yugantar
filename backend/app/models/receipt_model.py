from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from sqlalchemy import Integer, String, Float, DateTime
from datetime import datetime, timezone

from app.models import BaseModel

# Table to store receipts for each deposits from user
class Receipt(BaseModel):
    __tablename__ = "receipt"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    receipt_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    receipt_screenshot: Mapped[str] = mapped_column(String(255), nullable=True)
    amount: Mapped[float] = mapped_column(Float)
    date: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="receipts")
    deposit = relationship("Deposit", back_populates="receipts")
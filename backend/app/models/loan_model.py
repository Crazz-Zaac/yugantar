from sqlalchemy import Column, Integer, String, Float, DateTime, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from sqlalchemy import ForeignKey
from typing import Optional

from app.models.base import BaseModel

# Table to Loan issued to users
class Loan(BaseModel):
    __tablename__ = "loan"

    loan_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id"))
    amount: Mapped[float] = mapped_column(Float)
    interest_rate: Mapped[float] = mapped_column(Float)
    start_date: Mapped[datetime] = mapped_column(DateTime)
    end_date: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(50))
    approved_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    total_paid: Mapped[float] = mapped_column(Float, default=0)
    remaining_amount: Mapped[float] = mapped_column(Float, default=0)
    is_renewed: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="loans")
    deposits = relationship("Deposit", back_populates="deposits")
    
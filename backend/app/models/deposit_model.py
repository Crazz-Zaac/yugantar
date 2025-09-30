from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional

from app.models import BaseModel



class Deposit(BaseModel):
    __tablename__ = "deposit"

    deposit_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    deposited_amount: Mapped[float] = mapped_column(Float)
    amount_to_be_deposited: Mapped[float] = mapped_column(Float)
    date: Mapped[datetime] = mapped_column(DateTime)
    receipt_screenshot: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    receipt_id: Mapped[int] = mapped_column(Integer, ForeignKey("receipt.id"))
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="deposits")
    # loan = relationship("Loan", back_populates="takes_loan")
    receipt = relationship("Receipt", back_populates="deposits", uselist=False)
    fine = relationship("Fine", back_populates="deposits", uselist=False)
    



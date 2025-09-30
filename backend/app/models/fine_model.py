from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, Float, DateTime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.models import BaseModel

# Table to store fines imposed on users
class Fine(BaseModel):
    __tablename__ = "fine"

    fine_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    amount: Mapped[float] = mapped_column(Float)
    date: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="fines")
    deposit = relationship("Deposit", back_populates="fines")
    
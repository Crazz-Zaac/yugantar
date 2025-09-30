from typing import Optional, List

from sqlalchemy import Column, ARRAY, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime, timezone

from app.models import BaseModel


# Table to store user information
class User(BaseModel):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[Optional[str]] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(100), unique=True)
    password: Mapped[str] = mapped_column(String(255))
    password_repeat: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(15))
    address: Mapped[str] = mapped_column(String(255))
    roles: Mapped[List[str]] = mapped_column(ARRAY(String(50)))
    cooperative_roles: Mapped[List[str]] = mapped_column(ARRAY(String(50)))
    disabled: Mapped[bool] = mapped_column(default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    
    deposits = relationship("Deposit", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    loans = relationship("Loan", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    # savings = relationship("Saving", back_populates="user")
    

    
    
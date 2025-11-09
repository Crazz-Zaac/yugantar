from sqlmodel import SQLModel, Field, Relationship
from typing import Optional

from .base_policy import BasePolicy
from app.models.deposit_model import Deposit


class DepositPolicy(BasePolicy, table=True):

    __table_args__ = {"extend_existing": True}

    deposit_amount_threshold: float = Field(
        default=0.0,
        ge=0.1,
        description="The threshold for deposit amount required under this policy",
    )
    late_deposit_fine: float = Field(
        default=0.0,
        ge=0.0,
        description="The percentage of late fee applied to late deposits",
    )
    deposit_frequency_days: int = Field(
        default=30,
        ge=1,
        description="Number of days between required deposits",
    )

    deposits: list["Deposit"] = Relationship(back_populates="deposit_policy")

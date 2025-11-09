from sqlmodel import SQLModel, Field
from typing import Optional

from .base_policy import BasePolicy


class PenaltyPolicy(BasePolicy, table=True):

    __table_args__ = {"extend_existing": True}

    late_payment_fee: float = Field(
        default=0.0,
        ge=0.0,
        description="The fee applied for late payments under this policy",
    )

    late_deposit_penalty: float = Field(
        default=0.0,
        ge=0.0,
        description="The fee applied for late deposits under this policy",
    )

    penalty_grace_period_days: int = Field(
        default=0,
        ge=0,
        description="Number of grace period days before penalties apply",
    )

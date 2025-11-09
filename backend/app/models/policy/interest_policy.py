from sqlmodel import SQLModel, Field
from typing import Optional
from decimal import Decimal

from .base_policy import BasePolicy


class InterestPolicy(BasePolicy, table=True):

    __table_args__ = {"extend_existing": True}

    standard_interest_rate: Decimal = Field(
        default=1.0,
        ge=0.1,
        description="The standard interest rate applied under this policy",
    )
    penalty_interest_rate: Decimal = Field(
        default=2.0,
        ge=0.1,
        description="The penalty interest rate applied for late payments under this policy",
    )

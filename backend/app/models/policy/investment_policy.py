from sqlmodel import Field
from typing import Optional

from .base_policy import BasePolicy


class InvestmentPolicy(BasePolicy, table=True):

    __table_args__ = {"extend_existing": True}

    investment_assigned_to: str = Field(
        default=None,
        description="The specific entity or user assigned to this investment policy",
    )

    investing_asset_type: str = Field(
        default=None,
        description="The type of asset designated for investment under this policy",
    )

    investment_threshold_amount: float = Field(
        default=0.0,
        ge=0.1,
        description="The minimum investment amount required under this policy",
    )
    expected_return_rate: float = Field(
        default=1.0,
        ge=0.1,
        description="The expected return rate on investments under this policy",
    )
    investment_duration_days: int = Field(
        default=30,
        ge=1,
        description="The duration in days for which the investment must be held",
    )
    reinvestment_option: bool = Field(
        default=False,
        description="Indicates if reinvestment of returns is allowed under this policy",
    )
    max_investment_per_user: Optional[float] = Field(
        default=None,
        ge=0.1,
        description="The maximum investment amount allowed per user under this policy",
    )

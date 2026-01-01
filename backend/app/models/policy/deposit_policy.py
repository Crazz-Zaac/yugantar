from sqlmodel import Field, Relationship
from enum import Enum
from typing import Optional

from .base_policy import BasePolicy
from app.models.deposit_model import Deposit
from app.models.mixins.money import MoneyMixin


class DepositScheduleType(str, Enum):
    MONTHLY_FIXED_DAY = "monthly_fixed_day"
    OCCASIONAL = "occasional"


class DepositPolicy(BasePolicy, MoneyMixin, table=True):

    __table_args__ = {"extend_existing": True}

    # money mixin provides amount_paisa
    # amount is stored in amount_paisa for precision in NRs

    late_deposit_fine: float = Field(
        default=0.0,
        ge=0.0,
        description="The percentage of late fee applied to late deposits",
    )

    schedule_type: DepositScheduleType = Field(
        default=DepositScheduleType.MONTHLY_FIXED_DAY,
        description="The type of deposit schedule",
    )

    # Used when schedule_type is MONTHLY_FIXED_DAY
    due_day_of_month: Optional[int] = Field(
        default=None,
        ge=1,
        le=31,
        description="The day of the month when deposits are due (1-31). Applicable if schedule_type is monthly_fixed_day.",
    )

    # Used when schedule_type is OCCASIONAL
    allowed_months: Optional[int] = Field(
        default=None,
        description="The number of months within which the deposit should be made. Applicable if schedule_type is monthly_fixed_day.",
    )

    max_occurrences: Optional[int] = Field(
        default=None,
        description="The maximum number of deposit occurrences allowed. Applicable if schedule_type is occasional.",
    )

    deposits: list["Deposit"] = Relationship(back_populates="deposit_policy")

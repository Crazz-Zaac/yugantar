from sqlmodel import Field, Relationship
from sqlalchemy import Column, Numeric
from typing import Optional
from decimal import Decimal
from typing_extensions import Annotated
from typing import TYPE_CHECKING

from .base_policy import BasePolicy

if TYPE_CHECKING:
    from app.models.loan_model import Loan


Money = Annotated[
    Decimal,
    Field(
        ge=Decimal("0.00"),
        max_digits=12,
        decimal_places=2,
    ),
]


class LoanPolicy(BasePolicy, table=True):

    __table_args__ = {"extend_existing": True}

    max_loan_amount: Money = Field(
        sa_column=Column(
            Numeric(12, 2),
            nullable=False,
            server_default="0.00",
        ),
        description="The maximum allowable loan amount under this policy",
    )
    min_loan_amount: Money = Field(
        sa_column=Column(
            Numeric(12, 2),
            nullable=False,
            server_default="0.00",
        ),
        description="The minimum allowable loan amount under this policy",
    )
    interest_rate: Decimal = Field(
        sa_column=Column(Numeric(5, 2), nullable=False, server_default="1.00"),
        description="The interest rate applied to loans under this policy",
    )
    grace_period_days: int = Field(
        default=0,
        ge=0,
        description="Number of grace period days before penalties apply",
    )
    max_renewals: Optional[int] = Field(
        default=0,
        ge=0,
        description="Maximum number of times a loan can be renewed under this policy",
    )
    requires_collateral: bool = Field(
        default=False,
        description="Indicates if collateral is required for loans under this policy",
    )

    loans: list["Loan"] = Relationship(back_populates="policy")

from sqlmodel import Field
from decimal import Decimal


class MoneyMixin:
    """
    Stores monetary values as Decimal for precision.
    """

    amount_paisa: int = Field(gt=0, description="Amount in paisa (1 NPR = 100 paisa)")

    @property
    def amount_rupees(self) -> Decimal:
        """
        Convert paisa to rupees.
        """
        return Decimal(self.amount_paisa) / Decimal(100)

    @staticmethod
    def rupees_to_paisa(amount: Decimal) -> int:
        """
        Docstring for rupees_to_paisa

        :param amount: Description
        :type amount: Decimal
        :return type: int
        """
        return int((amount * 100).quantize(Decimal("1")))

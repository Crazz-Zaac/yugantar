from decimal import Decimal, ROUND_HALF_UP


def rupees_to_paisa(amount: Decimal) -> int:
    """
    Convert rupees to paisa (1 rupee = 100 paisa).

    Args:
        amount: Amount in rupees

    Returns:
        int: Amount in paisa

    Examples:
        >>> rupees_to_paisa(Decimal('100.50'))
        10050
    """
    return int(amount * 100)


def paisa_to_rupees(amount_paisa: int) -> Decimal:
    """
    Convert paisa to rupees.

    Args:
        amount_paisa: Amount in paisa

    Returns:
        Decimal: Amount in rupees

    Examples:
        >>> paisa_to_rupees(10050)
        Decimal('100.50')
    """
    return Decimal(amount_paisa) / Decimal(100)


def calculate_percentage(amount: Decimal, percentage: Decimal) -> Decimal:
    """
    Calculate percentage of an amount.

    Args:
        amount: Base amount
        percentage: Percentage (e.g., 5 for 5%)

    Returns:
        Decimal: Calculated amount
    """
    return (amount * percentage / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def format_currency_npr(amount: Decimal) -> str:
    """
    Format amount as Nepali Rupees.

    Args:
        amount: Amount to format

    Returns:
        str: Formatted string (e.g., "Rs. 1,234.56")
    """
    return f"Rs. {amount:,.2f}"

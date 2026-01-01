from datetime import datetime, timezone, timedelta
from decimal import Decimal


from app.models.policy.deposit_policy import DepositPolicy, DepositScheduleType


def calculate_due_date(
    policy: DepositPolicy,
    reference_date: datetime | None = None,
) -> datetime:
    """Calculate the next due date for a deposit based on the policy.

    Args:
        policy (DepositPolicy): The deposit policy to use for calculation.
        reference_date (datetime | None): The date from which to calculate the next due date.
            If None, uses the current date.

    Returns:
        datetime: The calculated due date for the next deposit.
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)

    if policy.schedule_type == DepositScheduleType.MONTHLY_FIXED_DAY:
        if policy.due_day_of_month is None:
            raise ValueError(
                "due_day_of_month must be set for MONTHLY_FIXED_DAY schedule type."
            )

        return _calculate_monthly_fixed_day_due_date(
            reference_date, policy.due_day_of_month
        )
    elif policy.schedule_type == DepositScheduleType.OCCASIONAL:
        if policy.allowed_months is None:
            raise ValueError("allowed_months must be set for OCCASIONAL schedule type.")

        return _calculate_occasional_due_date(reference_date, policy.allowed_months)
    else:
        raise ValueError("Invalid schedule type in deposit policy.")


def _calculate_monthly_fixed_day_due_date(
    reference_date: datetime, due_day_of_month: int
) -> datetime:
    """Calculate the next due date for MONTHLY_FIXED_DAY schedule type.

    Args:
        reference_date (datetime): The date from which to calculate the next due date.
        due_day_of_month (int): The day of the month when deposits are due.

    Returns:
        datetime: The calculated due date for the next deposit.
    """

    if reference_date.tzinfo is None:
        reference_date = reference_date.replace(tzinfo=timezone.utc)

    year = reference_date.year
    month = reference_date.month

    # Determine if the due day has already passed this month
    if reference_date.day >= due_day_of_month:
        # Move to the next month
        month += 1
        if month > 12:
            month = 1
            year += 1

    # Handle cases where the due day exceeds the number of days in the month
    try:
        due_date = datetime(
            year, month, due_day_of_month, 23, 59, 59, tzinfo=timezone.utc
        )
    except ValueError:
        due_date = _get_last_day_of_month(year, month)

    return due_date


def _get_last_day_of_month(year: int, month: int) -> datetime:
    """Get the last day of a given month.

    Args:
        year (int): The year.
        month (int): The month.

    Returns:
        datetime: The last day of the month at 23:59:59 UTC.
    """
    if month == 12:
        next_month = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    last_day = next_month - timedelta(days=1)
    return last_day.replace(hour=23, minute=59, second=59)


def _calculate_occasional_due_date(
    reference_date: datetime, allowed_months: int
) -> datetime:
    """Calculate the due date for OCCASIONAL schedule type.

    Args:
        reference_date (datetime): The date from which to calculate the next due date.
        allowed_months (int): The number of months within which the deposit should be made.

    Returns:
        datetime: The calculated due date for the next deposit.
    """
    if reference_date.tzinfo is None:
        reference_date = reference_date.replace(tzinfo=timezone.utc)

    days_to_add = allowed_months * 30  # Approximate month as 30 days
    due_date = reference_date + timedelta(days=days_to_add)

    # set time to end of day
    due_date = due_date.replace(hour=23, minute=59, second=59)

    return due_date


def calculate_late_fine(
    deposited_date: datetime,
    due_deposit_date: datetime,
    late_deposit_fine_percentage: float,
    amount_to_be_deposited: Decimal,
) -> Decimal:
    """Calculate the late fine for a deposit.

    Args:
        deposited_date (datetime): The date when the deposit was made.
        due_deposit_date (datetime): The due date for the deposit.
        late_deposit_fine_percentage (float): The percentage of late fine to be applied.
        amount_to_be_deposited (Decimal): The amount that was supposed to be deposited.

    Returns:
        Decimal: The calculated late fine amount. Returns 0 if the deposit is on time.
    """
    if deposited_date <= due_deposit_date:
        return Decimal(0)

    fine_percentage_decimal = Decimal(late_deposit_fine_percentage) / Decimal(100)
    fine_amount = amount_to_be_deposited * fine_percentage_decimal

    return fine_amount.quantize(Decimal("0.01"))  # Round to 2 decimal places


def is_deposit_late(
    deposited_date: datetime,
    due_deposit_date: datetime,
) -> bool:
    """Check if a deposit is late.

    Args:
        deposited_date (datetime): The date when the deposit was made.
        due_deposit_date (datetime): The due date for the deposit.

    Returns:
        bool: True if the deposit is late, False otherwise.
    """
    return deposited_date > due_deposit_date


def days_until_due(
    due_deposit_date: datetime,
    reference_date: datetime | None = None,
) -> int:
    """Calculate the number of days until the deposit is due.

    Args:
        due_deposit_date (datetime): The due date for the deposit.
        reference_date (datetime | None): The date from which to calculate the days until due.
            If None, uses the current date.

    Returns:
        int: The number of days until the deposit is due. Negative if overdue.
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)

    delta = due_deposit_date.date() - reference_date.date()
    return delta.days

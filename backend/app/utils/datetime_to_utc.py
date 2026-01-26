from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_datetime_to_utc(
    date_str: Optional[str], local_tz: str = "Asia/Kathmandu"
) -> Optional[str]:
    """Parse a date string and convert it to UTC.

    Args:
        date_str (str): The date string to parse.
        local_tz: The local timezone object.

    Returns:
        datetime: The parsed datetime in UTC.
    """
    if not date_str:
        return None

    date_str = date_str.strip()

    formats = [
        "%d %b %Y, %I:%M %p",
        "%d %b %Y,%I:%M %p",
        "%d %b %Y, %H:%M",
        "%d %b %Y,%H:%M",
        "%d-%b-%Y %I:%M %p",
        "%d-%b-%Y,%I:%M %p",  
        "%d-%b-%Y %H:%M",
        "%d-%b-%Y,%H:%M",
        "%d %b %Y %I:%M %p",
        "%d %b %Y %H:%M",
    ]

    for fmt in formats:
        try:
            local_dt = datetime.strptime(date_str, fmt)
            local_dt = local_dt.replace(tzinfo=ZoneInfo(local_tz))
            return local_dt.astimezone(ZoneInfo("UTC")).isoformat()
        except ValueError:
            continue

    logger.warning(f"Unrecognized date format: {date_str}")
    return None

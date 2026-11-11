"""
The cooperative's local timezone: Nepal Time (NPT, UTC+5:45, no DST).

Timestamps are stored and sent in UTC. Calendar rules ("due on the 10th",
"end of the day") and dates shown to people (e.g. in emails) use local time,
so a day runs from 00:00 to 23:59:59 in Nepal, not in UTC.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

LOCAL_TZ = ZoneInfo(settings.COOPERATIVE_TIMEZONE)
LOCAL_TZ_LABEL = settings.COOPERATIVE_TIMEZONE_LABEL


def to_local(dt: datetime) -> datetime:
    """An aware (or naive-UTC) datetime, converted to local time."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(LOCAL_TZ)


def now_local() -> datetime:
    return datetime.now(LOCAL_TZ)


def format_local(dt: datetime) -> str:
    """'18 Nov 2026, 15:15 NPT' for messages and emails."""
    return to_local(dt).strftime(f"%d %b %Y, %H:%M {LOCAL_TZ_LABEL}")

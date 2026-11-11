"""
All timestamps are UTC.

The columns are `timestamp without time zone` and the DB session runs in UTC,
so values are stored as UTC but come back *naive* (no timezone). Serialised
as-is ("2026-11-11T10:00:00"), browsers read them as local time, which is
wrong by the viewer's UTC offset (5h45 in Nepal).

This listener marks every naive datetime loaded from the database as UTC, so
the API always sends an explicit offset ("...Z") and Python code always
compares aware datetimes. Writes need no change: aware values are converted
to UTC by Postgres (session TimeZone = UTC).
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, event
from sqlalchemy.orm import attributes
from sqlmodel import SQLModel


def _mark_loaded_datetimes_utc(target, *_args) -> None:
    table = getattr(target, "__table__", None)
    if table is None:
        return
    values = target.__dict__
    for column in table.columns:
        if not isinstance(column.type, DateTime):
            continue
        value = values.get(column.key)
        if isinstance(value, datetime) and value.tzinfo is None:
            # set_committed_value: not a change, nothing is written back
            attributes.set_committed_value(target, column.key, value.replace(tzinfo=timezone.utc))


def register() -> None:
    """Attach to every table model (SQLModel subclasses); safe to call twice."""
    for event_name in ("load", "refresh"):
        if not event.contains(SQLModel, event_name, _mark_loaded_datetimes_utc):
            event.listen(SQLModel, event_name, _mark_loaded_datetimes_utc, propagate=True)

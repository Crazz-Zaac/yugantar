import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.calendar_model import EventCategory, EventRecurrence, EventVisibility, RsvpResponse


class EventBase(BaseModel):
    """visibility "private" = a personal event (any member); otherwise a
    cooperative event (office bearers only)."""

    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: EventCategory = EventCategory.MEETING
    visibility: EventVisibility = EventVisibility.MEMBERS
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    location: Optional[str] = Field(default=None, max_length=255)
    recurrence: EventRecurrence = EventRecurrence.NONE
    repeat_until: Optional[datetime] = None
    is_online: bool = False

    @field_validator("title", "description", "location", mode="before")
    @classmethod
    def _strip(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class EventCreate(EventBase):
    notify: bool = True

    @model_validator(mode="after")
    def _check(self):
        _check_times(self.start_at, self.end_at, self.recurrence, self.repeat_until)
        return self


class EventUpdate(EventBase):
    notify: bool = True

    @model_validator(mode="after")
    def _check(self):
        _check_times(self.start_at, self.end_at, self.recurrence, self.repeat_until)
        return self


def _check_times(start, end, recurrence, repeat_until):
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("Start and end times must include a timezone.")
    if end <= start:
        raise ValueError("The event must end after it starts.")
    if (end - start).days > 14:
        raise ValueError("An event can last at most 14 days.")
    if recurrence != EventRecurrence.NONE and repeat_until is not None and repeat_until < start:
        raise ValueError("The repeat end date must be after the first date.")


class MeetNowRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    visibility: EventVisibility = EventVisibility.MEMBERS
    minutes: int = Field(default=60, ge=15, le=240)


class RsvpRequest(BaseModel):
    occurrence_start: datetime
    response: RsvpResponse


class RsvpCounts(BaseModel):
    going: int = 0
    maybe: int = 0
    declined: int = 0


class CalendarItem(BaseModel):
    """One occurrence on the calendar: a stored event, or a due date shown
    from existing data (kind != "event")."""

    id: str
    kind: Literal["event", "deposit_due", "loan_maturity", "policy_deadline"]
    event_id: Optional[uuid.UUID] = None
    title: str
    description: Optional[str] = None
    category: str
    visibility: str = EventVisibility.MEMBERS.value
    start: datetime
    end: datetime
    all_day: bool = False
    location: Optional[str] = None
    is_online: bool = False
    recurrence: str = EventRecurrence.NONE.value
    repeat_until: Optional[datetime] = None
    # First occurrence of a repeating event (what Edit changes)
    series_start: Optional[datetime] = None
    series_end: Optional[datetime] = None
    cancelled: bool = False
    organizer_name: Optional[str] = None
    rsvp: Optional[RsvpCounts] = None
    my_response: Optional[RsvpResponse] = None
    # Online meetings: when the Join button becomes / stops being available
    join_from: Optional[datetime] = None
    join_until: Optional[datetime] = None
    link: Optional[str] = None  # where an automatic item leads in the app
    can_edit: bool = False


class CalendarFeed(BaseModel):
    items: list[CalendarItem]
    can_manage: bool
    meetings_enabled: bool


class RsvpPerson(BaseModel):
    name: str
    response: RsvpResponse


class JoinInfo(BaseModel):
    domain: str
    room: str  # "<app id>/<room>"
    jwt: str
    moderator: bool
    title: str
    display_name: str
    ends_at: datetime

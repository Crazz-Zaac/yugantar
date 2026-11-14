"""
Calendar events (meetings, assemblies, holidays, notices) and members' replies.

Office bearers create the cooperative's events (for all members, or for
office bearers only). Any member can add personal events that only they
see. An event can repeat weekly or monthly; each repetition is an
"occurrence" identified by its start time, and replies (Going / Maybe /
Can't go) are kept per occurrence. An online event has a Jitsi (JaaS) room;
the room name is random and only sent to people who may see the event.

Due dates (deposits, loan maturity, policy signing) are not stored here: the
calendar shows them from the existing data (services/calendar_service.py).
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, UniqueConstraint
from sqlmodel import Field

from app.models.base import BaseModel


class EventCategory(str, Enum):
    MEETING = "meeting"
    GENERAL_ASSEMBLY = "general_assembly"
    HOLIDAY = "holiday"
    NOTICE = "notice"
    OTHER = "other"
    PERSONAL = "personal"  # a member's own event (visibility PRIVATE)


class EventVisibility(str, Enum):
    MEMBERS = "members"  # every member
    OFFICE_BEARERS = "office_bearers"  # President, Treasurer, Secretary only
    PRIVATE = "private"  # personal: only the member who created it


class EventRecurrence(str, Enum):
    NONE = "none"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class RsvpResponse(str, Enum):
    GOING = "going"
    MAYBE = "maybe"
    DECLINED = "declined"


class CalendarEvent(BaseModel, table=True):
    __tablename__ = "calendar_event"
    __table_args__ = {"extend_existing": True}

    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000, nullable=True)
    category: EventCategory = Field(sa_column=Column(String(30), nullable=False, default=EventCategory.OTHER.value))
    visibility: EventVisibility = Field(
        sa_column=Column(String(20), nullable=False, default=EventVisibility.MEMBERS.value)
    )

    # First occurrence (UTC). All-day events start at 00:00 NPT.
    start_at: datetime = Field(index=True)
    end_at: datetime
    all_day: bool = Field(default=False)
    location: Optional[str] = Field(default=None, max_length=255, nullable=True)

    recurrence: EventRecurrence = Field(
        sa_column=Column(String(10), nullable=False, default=EventRecurrence.NONE.value)
    )
    # Last day a repeating event may start on (inclusive, end of day NPT)
    repeat_until: Optional[datetime] = Field(default=None, nullable=True)

    # Online meeting (Jitsi as a Service). Random, never shown to people who
    # can't see the event.
    is_online: bool = Field(default=False)
    room_name: Optional[str] = Field(default=None, max_length=80, nullable=True, unique=True)

    created_by: uuid.UUID = Field(index=True)
    cancelled: bool = Field(default=False, index=True)
    cancelled_at: Optional[datetime] = Field(default=None, nullable=True)

    # Start of the last occurrence a reminder was sent for (no duplicates)
    last_reminded_start: Optional[datetime] = Field(default=None, nullable=True)


class EventRsvp(BaseModel, table=True):
    __tablename__ = "event_rsvp"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", "occurrence_start", name="uq_event_rsvp"),
        {"extend_existing": True},
    )

    event_id: uuid.UUID = Field(foreign_key="calendar_event.id", index=True, ondelete="CASCADE")
    user_id: uuid.UUID = Field(index=True)
    occurrence_start: datetime
    response: RsvpResponse = Field(sa_column=Column(String(10), nullable=False))

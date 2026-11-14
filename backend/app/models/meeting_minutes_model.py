"""
Minutes of meetings (online or in person): the record of what was discussed,
what was concluded, who attended and how each resolution was voted.

Written by an office bearer (normally the Secretary), submitted, then
approved by the President (the Secretary when the President wrote them).
Approved minutes are locked and get a reference number and a PDF; their
resolutions form the cooperative's resolutions register. Every member who
attended is then asked to sign them (hand signature, as for policies); the
PDF shows the signatures, and the minutes are SIGNED once all have signed.

Agenda items are stored as JSON (see schemas/meeting_minutes_schema.py):
title, discussion, decision, and an optional vote (category, for, against,
abstained; the result is worked out from the votes).
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from app.models.base import BaseModel


class MinutesStatus(str, Enum):
    DRAFT = "draft"  # being written (also after being returned)
    SUBMITTED = "submitted"  # awaiting the President
    APPROVED = "approved"  # locked, official; attendees are asked to sign
    SIGNED = "signed"  # every attendee has signed


class MeetingMinutes(BaseModel, table=True):
    __tablename__ = "meeting_minutes"
    __table_args__ = {"extend_existing": True}

    title: str = Field(max_length=200)
    meeting_type: str = Field(max_length=20)  # "online" | "in_person"
    held_at: datetime = Field(index=True)
    location: Optional[str] = Field(default=None, max_length=255, nullable=True)
    event_id: Optional[uuid.UUID] = Field(default=None, nullable=True, index=True)  # calendar meeting, if any
    chaired_by: str = Field(max_length=200)

    recorded_by: uuid.UUID = Field(index=True)
    recorded_by_name: str = Field(max_length=200)

    attendee_ids: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    guests: Optional[str] = Field(default=None, max_length=500, nullable=True)
    members_total: int = Field(default=0)  # members at the time (for "X of Y present")
    agenda: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    other_business: Optional[str] = Field(default=None, max_length=4000, nullable=True)

    status: str = Field(default=MinutesStatus.DRAFT.value, max_length=20, index=True)
    submitted_at: Optional[datetime] = Field(default=None, nullable=True)
    reviewed_by: Optional[uuid.UUID] = Field(default=None, nullable=True)
    reviewed_by_name: Optional[str] = Field(default=None, max_length=200, nullable=True)
    reviewed_at: Optional[datetime] = Field(default=None, nullable=True)
    return_note: Optional[str] = Field(default=None, max_length=500, nullable=True)

    reference: Optional[str] = Field(default=None, max_length=40, unique=True, nullable=True)
    file_key: Optional[str] = Field(default=None, max_length=300, nullable=True)
    sha256: Optional[str] = Field(default=None, max_length=64, nullable=True)


class MinutesSignatureStatus(str, Enum):
    PENDING = "pending"
    SIGNED = "signed"
    DECLINED = "declined"  # with a reason (e.g. the minutes are wrong)


class MinutesSignature(BaseModel, table=True):
    """One attendee's signature on approved minutes."""

    __tablename__ = "minutes_signature"
    __table_args__ = (
        UniqueConstraint("minutes_id", "user_id", name="uq_minutes_signature"),
        {"extend_existing": True},
    )

    minutes_id: uuid.UUID = Field(foreign_key="meeting_minutes.id", index=True, ondelete="CASCADE")
    user_id: uuid.UUID = Field(index=True)
    status: str = Field(default=MinutesSignatureStatus.PENDING.value, max_length=20)
    signer_name: Optional[str] = Field(default=None, max_length=200, nullable=True)
    signed_at: Optional[datetime] = Field(default=None, nullable=True)
    signature_file_key: Optional[str] = Field(default=None, max_length=300, nullable=True)
    signature_sha256: Optional[str] = Field(default=None, max_length=64, nullable=True)
    note: Optional[str] = Field(default=None, max_length=500, nullable=True)  # reason for declining

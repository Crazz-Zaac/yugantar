from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone

import uuid

class MeetingMinutesModel(SQLModel, table=True):
    """
    Model representing meeting minutes.
    """

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        description="Unique identifier for each meeting minutes record",
    )
    
    title: str = Field(
        nullable=False,
        max_length=200,
        description="Title of the meeting",
    )

    meeting_date: datetime = Field(
        nullable=False,
        description="Date and time when the meeting took place",
    )

    attendees: str = Field(
        nullable=False,
        description="List of attendees present in the meeting",
    )

    minutes_content: str = Field(
        nullable=False,
        description="Detailed text of the meeting minutes",
    )

    recorded_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Identifier of the user who recorded the meeting minutes",
    )
    
    approved_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Identifier of the user who approved the meeting minutes",
    )
    
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        description="Timestamp when the meeting minutes were created",
    )

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        description="Timestamp when the meeting minutes were last updated",
    )
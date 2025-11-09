from sqlmodel import SQLModel
from typing import Optional
from datetime import datetime
import uuid

# -----------------------------
# Create Schema
# -----------------------------
class MeetingMinutesCreate(SQLModel):
    title: str
    meeting_date: datetime
    attendees: str
    minutes_content: str
    recorded_by: Optional[str] = None
    approved_by: Optional[str] = None
    
# -----------------------------
# Update Schema
# -----------------------------
class MeetingMinutesUpdate(SQLModel):
    title: Optional[str] = None
    meeting_date: Optional[datetime] = None
    attendees: Optional[str] = None
    minutes_content: Optional[str] = None
    recorded_by: Optional[str] = None
    approved_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    
# -----------------------------
# Read / Response Schema
# -----------------------------
class MeetingMinutesResponse(SQLModel):
    id: uuid.UUID
    title: str
    meeting_date: datetime
    attendees: str
    minutes_content: str
    recorded_by: Optional[str]
    approved_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

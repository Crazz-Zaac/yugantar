import uuid
from sqlmodel import SQLModel
from datetime import datetime
from typing import Optional


class NotificationResponse(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message: str
    notification_type: str
    policy_id: Optional[uuid.UUID] = None
    policy_type: Optional[str] = None
    loan_id: Optional[uuid.UUID] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

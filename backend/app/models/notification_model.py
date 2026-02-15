import uuid
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, String
from datetime import datetime, timezone
from typing import Optional
from enum import Enum


class NotificationType(str, Enum):
    POLICY_APPROVAL = "policy_approval"
    POLICY_APPROVED = "policy_approved"
    POLICY_REJECTED = "policy_rejected"
    POLICY_FINALIZED = "policy_finalized"
    GENERAL = "general"


class Notification(SQLModel, table=True):
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
    )

    # Who should see this notification
    user_id: uuid.UUID = Field(index=True, nullable=False)

    title: str = Field(max_length=200, nullable=False)
    message: str = Field(max_length=1000, nullable=False)

    notification_type: NotificationType = Field(
        sa_column=Column(String),
        default=NotificationType.GENERAL,
    )

    # For policy approval notifications, link to the policy
    policy_id: Optional[uuid.UUID] = Field(default=None, nullable=True)
    policy_type: Optional[str] = Field(default=None, max_length=50, nullable=True)

    is_read: bool = Field(default=False)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

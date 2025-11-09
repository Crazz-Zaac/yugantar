from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import DateTime
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String

import uuid
from enum import Enum


class ChangeType(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    ACTIVATED = "activated"
    DEACTIVATED = "deactivated"


class PolicyChangeLog(SQLModel, table=True):

    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)

    # Link to the changed policy
    policy_id: uuid.UUID = Field(
        index=True,
        description="The unique identifier of the policy that was changed",
    )

    policy_type: str = Field(
        max_length=100,
        index=True,
        description="The type of the policy that was changed (e.g., InterestPolicy, InvestmentPolicy)",
    )

    # Change metadata
    change_type: ChangeType = Field(
        sa_column=Column(String),
        description="The type of change made to the policy",
    )

    # versioning info
    version_before: Optional[int] = Field(
        default=None,
        description="The version number of the policy before the change",
    )
    version_after: int = Field(
        description="The version number of the policy after the change",
    )

    # change details
    changes: Dict[str, Any] = Field(
        sa_column=Column(JSONB),
        description="A JSON object detailing the specific changes made to the policy",
    )

    # snapshot of the policy after change
    snapshot_before: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB),
        description="A JSON object representing the state of the policy before the change",
    )
    snapshot_after: Dict[str, Any] = Field(
        sa_column=Column(JSONB),
        description="A JSON object representing the state of the policy after the change",
    )

    # audit fields
    changed_by: Optional[str] = Field(
        max_length=100,
        index=True,
        description="Identifier of the user who made the change",
    )

    changed_reason: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Reason provided for making the change to the policy",
    )
    changed_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            index=True,
            default=datetime.now(timezone.utc),
        ),
        description="Timestamp when the change was made",
    )

    # IP address of the user making the change
    changed_from_ip: Optional[str] = Field(
        default=None,
        max_length=45,
        description="IP address from which the change was made",
    )

    user_agent: Optional[str] = Field(
        default=None,
        max_length=255,
        description="User agent string of the client used to make the change",
    )

    class Config:
        from_attributes = True

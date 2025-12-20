from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import uuid


class BasePolicy(SQLModel, table=False):
    """
    Abstract base class for all policy models.
    Provides:
    - Unique policy_id
    - Created and updated timestamps
    - Optional metadata field for extensibility
    """

    policy_id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False,
        description="Unique identifier for each policy record",
    )

    # Versioning
    version: int = Field(
        default=1, ge=1, description="Policy version number, incremented on each update"
    )

    # Effective dates
    effective_from: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        description="Timestamp when the policy becomes effective",
    )

    effective_to: Optional[datetime] = Field(
        default=None, nullable=True, description="Timestamp when the policy expires"
    )

    # Audit fields
    created_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Identifier of the user who created the policy",
    )

    # status flags
    is_active: bool = Field(
        default=True, description="Indicates whether the policy is currently active"
    )

    # Timestamp fields
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        description="Timestamp when the policy was created",
    )

    updated_by: Optional[str] = Field(
        default=None, description="User who last updated the policy"
    )
    updated_at: Optional[datetime] = Field(
        default=None, description="Timestamp of the last update to the policy"
    )

    class Config:
        from_attributes = True

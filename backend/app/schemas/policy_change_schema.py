import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel

from app.models.policy_change_request_model import PolicyChangeAction, PolicyChangeStatus


class PolicyChangeCreate(SQLModel):
    """Treasurer asks to retire a policy."""

    policy_type: str  # "deposit" | "loan"
    policy_id: uuid.UUID
    reason: str


class PolicyChangeDecision(SQLModel):
    """President's note when approving or rejecting."""

    note: Optional[str] = None


class PolicyChangeResponse(SQLModel):
    id: uuid.UUID
    policy_type: str
    policy_id: uuid.UUID
    policy_label: str
    action: PolicyChangeAction
    status: PolicyChangeStatus
    reason: str
    requested_by_name: str
    decided_by_name: Optional[str] = None
    decision_note: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

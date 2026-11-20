import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from app.models.base import BaseModel


class PolicyChangeAction(str, Enum):
    DISABLE = "disable"  # retire an active policy (mark it expired, keep the record)


class PolicyChangeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class PolicyChangeRequest(BaseModel, table=True):
    """A Treasurer's request to retire a policy, awaiting President approval.

    The row itself is the audit trail: who requested it, why, who decided it,
    their note, and when — all traceable by the Admin.
    """

    __tablename__ = "policy_change_request"

    policy_type: str = Field(max_length=16)  # "deposit" | "loan"
    policy_id: uuid.UUID = Field(index=True)
    # A human snapshot of the policy so the log reads clearly even later.
    policy_label: str = Field(max_length=200)
    action: PolicyChangeAction = Field(default=PolicyChangeAction.DISABLE)
    status: PolicyChangeStatus = Field(default=PolicyChangeStatus.PENDING, index=True)
    reason: str = Field(max_length=500)

    requested_by: uuid.UUID = Field(foreign_key="user.id", index=True)
    requested_by_name: str = Field(max_length=160)

    decided_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    decided_by_name: Optional[str] = Field(default=None, max_length=160)
    decision_note: Optional[str] = Field(default=None, max_length=500)
    decided_at: Optional[datetime] = Field(default=None)

"""
The adoption record (PDF) of a policy, created once when it is adopted.

Policies live in separate tables (deposit / loan), so this is keyed by
(policy_type, policy_id) without a foreign key, like PolicySignature.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.models.base import BaseModel


class PolicyRecord(BaseModel, table=True):
    __table_args__ = (
        UniqueConstraint("policy_type", "policy_id", name="uq_policy_record_policy"),
        {"extend_existing": True},
    )

    policy_type: str = Field(max_length=20, index=True)
    policy_id: uuid.UUID = Field(index=True)
    # Printed at the top of the letter, e.g. "YUG/DP/2026/0003"
    reference: str = Field(max_length=40, unique=True, index=True)
    file_key: str = Field(max_length=300)
    sha256: str = Field(max_length=64)
    generated_at: datetime
    # The Treasurer named in the signature block
    certified_by_name: Optional[str] = Field(default=None, max_length=200, nullable=True)

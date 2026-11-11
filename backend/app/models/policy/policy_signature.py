"""
Member signatures on policies.

A policy becomes ACTIVE only when every member has signed it. When the
Treasurer opens a policy for signing, one PolicySignature row is created per
required signer (a snapshot of the members at that time).

If a member is absent, an Admin can sign on their behalf, but only through a
PolicyProxyRequest that the President, Treasurer and Secretary each authorise
(after the absent member was consulted, e.g. by phone).
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.models.base import BaseModel


class SignatureStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ProxyRequestStatus(str, Enum):
    PENDING = "pending"  # waiting for office bearers' authorisation
    APPLIED = "applied"  # authorised; signature recorded
    DECLINED = "declined"  # an office bearer declined
    CANCELLED = "cancelled"  # withdrawn by the admin, or the policy closed


class PolicySignature(BaseModel, table=True):
    __table_args__ = (
        UniqueConstraint("policy_type", "policy_id", "user_id", name="uq_policy_signer"),
        {"extend_existing": True},
    )

    # "deposit" | "loan" (policies live in separate tables, so no FK)
    policy_type: str = Field(max_length=20, index=True)
    policy_id: uuid.UUID = Field(index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    status: SignatureStatus = Field(default=SignatureStatus.PENDING)
    # Name as signed (kept even if the user later changes their name)
    signer_name: Optional[str] = Field(default=None, max_length=200, nullable=True)
    signed_at: Optional[datetime] = Field(default=None, nullable=True)
    reason: Optional[str] = Field(default=None, max_length=500, nullable=True)

    # Set when the signature was recorded by an Admin on the member's behalf
    proxy_request_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="policyproxyrequest.id", nullable=True
    )


class PolicyProxyRequest(BaseModel, table=True):
    __table_args__ = {"extend_existing": True}

    policy_type: str = Field(max_length=20, index=True)
    policy_id: uuid.UUID = Field(index=True)
    signer_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)  # the absent member
    requested_by: uuid.UUID = Field(foreign_key="user.id")  # the Admin

    decision: SignatureStatus  # APPROVED or REJECTED, as agreed with the member
    reason: Optional[str] = Field(default=None, max_length=500, nullable=True)
    consultation_note: str = Field(max_length=1000)  # e.g. "Agreed by phone on 12 Nov"

    status: ProxyRequestStatus = Field(default=ProxyRequestStatus.PENDING, index=True)
    resolved_at: Optional[datetime] = Field(default=None, nullable=True)


class PolicyProxyAuthorisation(BaseModel, table=True):
    __table_args__ = (
        UniqueConstraint("request_id", "user_id", name="uq_proxy_authoriser"),
        {"extend_existing": True},
    )

    request_id: uuid.UUID = Field(foreign_key="policyproxyrequest.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id")
    approved: bool
    note: Optional[str] = Field(default=None, max_length=500, nullable=True)

import uuid
from datetime import datetime
from typing import List, Optional

from datetime import timezone

from pydantic import field_validator
from sqlmodel import Field, SQLModel

from app.models.policy.base_policy import PolicyStatus
from app.models.policy.policy_signature import ProxyRequestStatus, SignatureStatus


# ---------- requests ----------
class SignRequest(SQLModel):
    decision: SignatureStatus  # "approved" or "rejected"
    reason: Optional[str] = Field(default=None, max_length=500)
    # Hand signature as a data URL (data:image/png;base64,...), drawn or uploaded
    signature_image: Optional[str] = None


class OpenForSigningRequest(SQLModel):
    """The Treasurer signs when opening a policy; optional hand signature."""
    signature_image: Optional[str] = None


class ProxyRequestCreate(SQLModel):
    signer_user_id: uuid.UUID
    decision: SignatureStatus
    reason: Optional[str] = Field(default=None, max_length=500)
    consultation_note: str = Field(min_length=5, max_length=1000)


class ProxyAuthoriseRequest(SQLModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=500)


# ---------- responses ----------
class UTCOut(SQLModel):
    """The DB stores naive UTC timestamps; mark them as UTC so browsers don't
    read them as local time (Nepal is UTC+5:45)."""

    @field_validator("*", mode="after")
    @classmethod
    def _utc(cls, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class ProxyAuthorisationOut(UTCOut):
    name: str
    roles: List[str]
    approved: bool
    note: Optional[str] = None
    at: Optional[datetime] = None


class ProxyRequestOut(UTCOut):
    id: uuid.UUID
    policy_type: str
    policy_id: uuid.UUID
    policy_label: str
    signer_user_id: uuid.UUID
    signer_name: str
    requested_by_name: str
    decision: SignatureStatus
    reason: Optional[str] = None
    consultation_note: str
    status: ProxyRequestStatus
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    required_roles: List[str]  # office roles whose authorisation is needed
    authorisations: List[ProxyAuthorisationOut]
    can_authorise: bool = False  # for the requesting viewer


class SignatureOut(UTCOut):
    user_id: uuid.UUID
    name: str
    roles: List[str]
    status: SignatureStatus
    signed_at: Optional[datetime] = None
    reason: Optional[str] = None
    counted: bool = True  # False if the member has since been disabled
    has_signature_image: bool = False  # a hand signature is on file
    proxy: Optional[ProxyRequestOut] = None  # set when signed on their behalf


class PolicyTermOut(SQLModel):
    label: str
    value: str


class StatementPreview(SQLModel):
    """Generated wording for a policy being drafted."""
    statement_en: str
    statement_ne: str


class SigningSummary(UTCOut):
    policy_type: str
    policy_id: uuid.UUID
    label: str
    # What the policy says (the same wording as the PDF record)
    title: str = ""
    statement: str = ""
    statement_ne: str = ""  # Nepali wording
    statement_custom: bool = False  # the Treasurer edited the wording
    terms: List[PolicyTermOut] = []
    # Adoption record (PDF): available once adopted; reference set once generated
    record_available: bool = False
    preview_available: bool = False  # open for signing: a watermarked preview PDF
    record_reference: Optional[str] = None
    status: PolicyStatus
    signing_deadline: Optional[datetime] = None
    deadline_passed: bool = False
    required: int
    approved: int
    rejected: int
    pending: int
    my_status: Optional[SignatureStatus] = None
    signatures: List[SignatureOut]

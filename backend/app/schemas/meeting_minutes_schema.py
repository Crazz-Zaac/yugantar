import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

VoteCategory = Literal["policy", "bill", "investment", "loan", "budget", "election", "other"]


class Vote(BaseModel):
    category: VoteCategory = "other"
    votes_for: int = Field(ge=0, le=10000)
    votes_against: int = Field(ge=0, le=10000)
    abstained: int = Field(default=0, ge=0, le=10000)


class AgendaItem(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    discussion: Optional[str] = Field(default=None, max_length=4000)  # what was discussed
    decision: Optional[str] = Field(default=None, max_length=2000)  # what was concluded
    vote: Optional[Vote] = None  # put to a vote

    @field_validator("title", "discussion", "decision", mode="before")
    @classmethod
    def _strip(cls, v):
        return (v.strip() or None) if isinstance(v, str) else v


class MinutesIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    meeting_type: Literal["online", "in_person"]
    held_at: datetime
    location: Optional[str] = Field(default=None, max_length=255)
    event_id: Optional[uuid.UUID] = None
    chaired_by: str = Field(min_length=2, max_length=200)
    attendee_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)
    guests: Optional[str] = Field(default=None, max_length=500)
    agenda: list[AgendaItem] = Field(default_factory=list, max_length=50)
    other_business: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("title", "location", "chaired_by", "guests", "other_business", mode="before")
    @classmethod
    def _strip(cls, v):
        return (v.strip() or None) if isinstance(v, str) else v


class ReturnIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SignIn(BaseModel):
    signature_image: str = Field(min_length=50, max_length=2_000_000)  # data:image/png;base64,...


class DeclineIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SignatureOut(BaseModel):
    user_id: uuid.UUID
    name: str
    status: str  # pending | signed | declined
    signed_at: Optional[datetime] = None
    has_image: bool = False
    note: Optional[str] = None


class VoteOut(Vote):
    result: Literal["passed", "not_passed"]
    unanimous: bool


class AgendaItemOut(BaseModel):
    title: str
    discussion: Optional[str] = None
    decision: Optional[str] = None
    vote: Optional[VoteOut] = None


class Attendee(BaseModel):
    id: uuid.UUID
    name: str


class MinutesOut(BaseModel):
    id: uuid.UUID
    title: str
    meeting_type: str
    held_at: datetime
    location: Optional[str]
    event_id: Optional[uuid.UUID]
    chaired_by: str
    recorded_by_name: str
    attendees: list[Attendee]
    guests: Optional[str]
    members_total: int
    agenda: list[AgendaItemOut]
    other_business: Optional[str]
    status: str
    submitted_at: Optional[datetime]
    reviewed_by_name: Optional[str]
    reviewed_at: Optional[datetime]
    return_note: Optional[str]
    reference: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    can_edit: bool = False
    can_review: bool = False
    has_pdf: bool = False
    signatures: list[SignatureOut] = []
    signed_count: int = 0
    my_signature: Optional[str] = None  # the viewer's status, if they attended
    can_sign: bool = False


class MinutesSummary(BaseModel):
    id: uuid.UUID
    title: str
    meeting_type: str
    held_at: datetime
    status: str
    reference: Optional[str]
    present: int
    members_total: int
    resolutions: int
    passed: int
    recorded_by_name: str
    can_review: bool = False
    signed_count: int = 0
    needs_my_signature: bool = False


class MinutesList(BaseModel):
    items: list[MinutesSummary]
    can_write: bool


class ResolutionOut(BaseModel):
    minutes_id: uuid.UUID
    reference: Optional[str]
    held_at: datetime
    meeting_title: str
    title: str
    decision: Optional[str]
    category: str
    votes_for: int
    votes_against: int
    abstained: int
    present: int
    result: str
    unanimous: bool


class Prefill(BaseModel):
    title: str
    meeting_type: str
    held_at: datetime
    location: Optional[str]
    event_id: uuid.UUID
    suggested_attendee_ids: list[uuid.UUID]  # replied "Going"

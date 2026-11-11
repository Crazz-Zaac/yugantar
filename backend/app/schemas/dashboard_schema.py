import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from sqlmodel import SQLModel

# Amounts are rupees. Months are Nepal calendar months ("2026-03").


class MonthPoint(SQLModel):
    month: str  # "2026-03"
    deposited: Decimal = Decimal(0)
    cumulative: Decimal = Decimal(0)
    repaid: Decimal = Decimal(0)


class NextDue(SQLModel):
    due_date: datetime
    amount: Decimal
    policy_label: str
    paid: bool  # a deposit (pending or verified) exists for this period
    days_left: int


class LoanSummaryOut(SQLModel):
    id: uuid.UUID
    status: str
    purpose: Optional[str] = None
    principal: Decimal
    principal_paid: Decimal
    interest_paid: Decimal
    outstanding: Decimal
    progress_pct: int
    interest_rate: Decimal
    start_date: datetime
    maturity_date: datetime
    payments: int


class ActionItem(SQLModel):
    kind: Literal["sign_policy", "review_deposits", "review_loans", "review_payments", "authorise_proxy", "pending_deposit"]
    title: str
    detail: str
    count: int = 1
    link: str
    urgent: bool = False


class ActivityItem(SQLModel):
    date: datetime
    kind: Literal["deposit", "loan_payment"]
    description: str
    amount: Decimal
    status: str


class MemberDashboard(SQLModel):
    first_name: str
    savings_total: Decimal
    deposits_count: int
    pending_amount: Decimal
    pending_count: int
    fines_total: Decimal
    next_due: Optional[NextDue] = None
    loan: Optional[LoanSummaryOut] = None
    loan_application_pending: bool = False
    monthly: List[MonthPoint]
    actions: List[ActionItem]
    recent: List[ActivityItem]


class OpenPolicy(SQLModel):
    policy_type: str
    policy_id: uuid.UUID
    label: str
    approved: int
    required: int
    rejected: int
    deadline: Optional[datetime] = None


class AdminMonthPoint(SQLModel):
    month: str
    deposits: Decimal = Decimal(0)
    loans_disbursed: Decimal = Decimal(0)
    new_members: int = 0
    total_members: int = 0


class RecentMember(SQLModel):
    id: uuid.UUID
    name: str
    email: str
    joined_at: datetime
    status: Literal["active", "pending_approval", "unverified", "disabled"]


class AdminDashboard(SQLModel):
    members_active: int
    members_pending_approval: int
    members_unverified: int
    members_disabled: int
    members_new_this_month: int
    savings_total: Decimal
    deposits_this_month: Decimal
    pending_deposits: int
    loans_outstanding: Decimal
    active_loans: int
    pending_loan_applications: int
    open_policies: List[OpenPolicy]
    monthly: List[AdminMonthPoint]
    recent_members: List[RecentMember]


class ActivityEvent(SQLModel):
    """One entry in the admin activity log (derived from existing records)."""

    at: datetime
    type: Literal["member", "deposit", "loan", "payment", "policy"]
    actor: str  # who did it
    action: str  # what happened, in words
    amount: Optional[Decimal] = None  # rupees, when money is involved
    status: Optional[str] = None

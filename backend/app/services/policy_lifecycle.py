"""
Which policy is in force right now.

A policy is *in force* when it is ACTIVE, has started (effective_from <= now)
and has not ended (no effective_to, or effective_to > now).

Deposits strictly follow the single **current deposit policy**: the in-force
deposit policy with the latest effective_from. Older ones that are still
marked active are superseded and can't be used for new deposits.

ACTIVE policies whose effective_to has passed are marked EXPIRED (hourly
Celery job, and whenever the current policy is looked up).
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.policy.base_policy import PolicyStatus
from app.models.policy.deposit_policy import DepositPolicy
from app.models.policy.loan_policy import LoanPolicy


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_in_force(policy, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if policy.status != PolicyStatus.ACTIVE:
        return False
    start, end = _utc(policy.effective_from), _utc(policy.effective_to)
    return (start is None or start <= now) and (end is None or end > now)


def expire_ended_policies(session: Session) -> int:
    """Mark ACTIVE policies whose end date has passed as EXPIRED."""
    now = datetime.now(timezone.utc)
    expired = 0
    for model in (DepositPolicy, LoanPolicy):
        for p in session.exec(select(model).where(model.status == PolicyStatus.ACTIVE)).all():
            end = _utc(p.effective_to)
            if end is not None and end <= now:
                p.status = PolicyStatus.EXPIRED
                p.updated_at = now
                session.add(p)
                expired += 1
    if expired:
        session.commit()
    return expired


def current_deposit_policy(session: Session) -> Optional[DepositPolicy]:
    """The single deposit policy deposits must use (None if none in force)."""
    expire_ended_policies(session)
    now = datetime.now(timezone.utc)
    in_force = [
        p for p in session.exec(select(DepositPolicy).where(DepositPolicy.status == PolicyStatus.ACTIVE)).all()
        if is_in_force(p, now)
    ]
    if not in_force:
        return None
    return max(in_force, key=lambda p: (_utc(p.effective_from), _utc(p.created_at) or now))


def require_current_deposit_policy(session: Session, policy_id=None) -> DepositPolicy:
    """The current deposit policy; refuses deposits that name any other one."""
    # local import: deposit_date_utils imports the model, not this module
    from app.utils.deposit_date_utils import calculate_due_date

    policy = current_deposit_policy(session)
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No deposit policy is in force right now. Please contact the Treasurer.",
        )
    if policy_id is not None and str(policy_id) != str(policy.policy_id):
        amount = float(policy.amount_paisa) / 100
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deposits must use the current deposit policy (Rs. {amount:,.0f}). Please refresh and try again.",
        )
    try:
        calculate_due_date(policy)  # misconfigured schedules can't compute a due date
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The current deposit policy is missing its schedule settings. Please ask the Treasurer to fix it.",
        )
    return policy

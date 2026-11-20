import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import Session, select

from app.models.policy.base_policy import PolicyStatus
from app.models.policy.deposit_policy import DepositPolicy
from app.models.policy.loan_policy import LoanPolicy
from app.models.policy_change_request_model import (
    PolicyChangeRequest,
    PolicyChangeAction,
    PolicyChangeStatus,
)
from app.models.notification_model import NotificationType
from app.models.user_model import User
from app.services.duties import Duty, require_duty, responsible_users, name_with_role
from app.services.notify import notify
from app.schemas.policy_change_schema import PolicyChangeCreate


def _get_policy(session: Session, policy_type: str, policy_id: uuid.UUID):
    model = DepositPolicy if policy_type == "deposit" else LoanPolicy
    return session.get(model, policy_id)


def _policy_label(policy, policy_type: str) -> str:
    if policy_type == "deposit":
        amt = (getattr(policy, "amount_paisa", 0) or 0) / 100
        return f"Deposit policy (Rs. {amt:,.0f})"
    lo = getattr(policy, "min_loan_amount", None)
    hi = getattr(policy, "max_loan_amount", None)
    if lo is not None and hi is not None:
        return f"Loan policy (Rs. {float(lo):,.0f}–{float(hi):,.0f})"
    return "Loan policy"


class PolicyChangeService:
    """Treasurer requests to retire a policy; the President approves or rejects.
    Every request and decision is stored (the audit trail)."""

    def create_request(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        req: PolicyChangeCreate,
        current_user: User,
    ) -> PolicyChangeRequest:
        require_duty(current_user, Duty.MANAGE_POLICY)  # Treasurer

        if req.policy_type not in ("deposit", "loan"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown policy type.")
        if not (req.reason or "").strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please give a reason for retiring this policy.")

        policy = _get_policy(session, req.policy_type, req.policy_id)
        if not policy:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Policy not found.")
        if policy.status != PolicyStatus.ACTIVE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Only an active policy needs a retirement request; this one isn't active.",
            )

        existing = session.exec(
            select(PolicyChangeRequest).where(
                PolicyChangeRequest.policy_id == req.policy_id,
                PolicyChangeRequest.status == PolicyChangeStatus.PENDING,
            )
        ).first()
        if existing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "There is already a pending retirement request for this policy.",
            )

        label = _policy_label(policy, req.policy_type)
        change = PolicyChangeRequest(
            policy_type=req.policy_type,
            policy_id=req.policy_id,
            policy_label=label,
            action=PolicyChangeAction.DISABLE,
            status=PolicyChangeStatus.PENDING,
            reason=req.reason.strip()[:500],
            requested_by=current_user.id,
            requested_by_name=name_with_role(current_user) or "Treasurer",
        )
        session.add(change)
        session.commit()
        session.refresh(change)

        presidents = responsible_users(session, Duty.DECIDE_POLICY_CHANGE)
        notify(
            session,
            background_tasks,
            presidents,
            "policy_retire_requested",
            NotificationType.POLICY_APPROVAL,
            policy_type=req.policy_type,
            policy_id=req.policy_id,
            label=label,
            reason=change.reason,
            commit=True,
        )
        return change

    def list_requests(
        self, session: Session, status_filter: Optional[PolicyChangeStatus] = None
    ) -> list[PolicyChangeRequest]:
        stmt = select(PolicyChangeRequest)
        if status_filter is not None:
            stmt = stmt.where(PolicyChangeRequest.status == status_filter)
        stmt = stmt.order_by(PolicyChangeRequest.created_at.desc())
        return list(session.exec(stmt).all())

    def _require_pending(self, session: Session, request_id: uuid.UUID) -> PolicyChangeRequest:
        change = session.get(PolicyChangeRequest, request_id)
        if not change:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")
        if change.status != PolicyChangeStatus.PENDING:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This request has already been decided.")
        return change

    def approve(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        request_id: uuid.UUID,
        note: Optional[str],
        current_user: User,
    ) -> PolicyChangeRequest:
        require_duty(current_user, Duty.DECIDE_POLICY_CHANGE)  # President
        change = self._require_pending(session, request_id)

        now = datetime.now(timezone.utc)
        policy = _get_policy(session, change.policy_type, change.policy_id)
        if policy and policy.status == PolicyStatus.ACTIVE:
            # Disable = retire: mark expired and end it now. The record is kept.
            policy.status = PolicyStatus.EXPIRED
            policy.effective_to = now
            policy.updated_at = now
            session.add(policy)

        change.status = PolicyChangeStatus.APPROVED
        change.decided_by = current_user.id
        change.decided_by_name = name_with_role(current_user) or "President"
        change.decision_note = (note or "").strip()[:500] or None
        change.decided_at = now
        session.add(change)
        session.commit()
        session.refresh(change)

        requester = session.get(User, change.requested_by)
        notify(
            session,
            background_tasks,
            [u for u in [requester] if u],
            "policy_retire_approved",
            NotificationType.POLICY_APPROVED,
            policy_type=change.policy_type,
            policy_id=change.policy_id,
            label=change.policy_label,
            commit=True,
        )
        return change

    def reject(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        request_id: uuid.UUID,
        note: Optional[str],
        current_user: User,
    ) -> PolicyChangeRequest:
        require_duty(current_user, Duty.DECIDE_POLICY_CHANGE)  # President
        change = self._require_pending(session, request_id)

        change.status = PolicyChangeStatus.REJECTED
        change.decided_by = current_user.id
        change.decided_by_name = name_with_role(current_user) or "President"
        change.decision_note = (note or "").strip()[:500] or None
        change.decided_at = datetime.now(timezone.utc)
        session.add(change)
        session.commit()
        session.refresh(change)

        requester = session.get(User, change.requested_by)
        notify(
            session,
            background_tasks,
            [u for u in [requester] if u],
            "policy_retire_rejected",
            NotificationType.POLICY_REJECTED,
            policy_type=change.policy_type,
            policy_id=change.policy_id,
            label=change.policy_label,
            note=change.decision_note or "",
            commit=True,
        )
        return change

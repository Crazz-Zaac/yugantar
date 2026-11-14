"""
Expenses: the Treasurer records them, the President approves or rejects them
(the Secretary when the President recorded it: nobody approves their own
entry), every member can see them. Only approved, non-voided expenses count
in the Financial Reports. A mistake is voided with a reason, never deleted.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import Session, select

from app import i18n
from app.models.expense_model import Expense, ExpenseStatus
from app.models.notification_model import NotificationType
from app.models.user_model import CooperativeRole, User
from app.schemas.expense_schema import ExpenseCreate, ExpenseList, ExpenseOut, ExpenseReject, ExpenseVoid
from app.services.duties import (
    Duty,
    coop_roles,
    denial_reason,
    is_active_member,
    may_perform_any,
    name_with_role,
    require_duty,
    responsible_users,
)
from app.services.notify import notify
from app.utils.local_time import to_local

CATEGORY_LABELS = {
    "meeting": i18n.both("Meeting", "बैठक"),
    "agm": i18n.both("AGM", "साधारण सभा"),
    "gift": i18n.both("Gift / welfare", "उपहार / कल्याण"),
    "office": i18n.both("Office & stationery", "कार्यालय र मसलन्द"),
    "bank_charges": i18n.both("Bank charges", "बैंक शुल्क"),
    "transport": i18n.both("Transport", "यातायात"),
    "other": i18n.both("Other", "अन्य"),
}


def can_record(user: User) -> bool:
    return is_active_member(user) and CooperativeRole.TREASURER.value in coop_roles(user)


def _require_member(user: User) -> None:
    if not (is_active_member(user) and user.cooperative_roles):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Expenses are only available to members.")


def _require_treasurer(user: User) -> None:
    if not can_record(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the Treasurer can record or void expenses.")


def _rs(paisa: int) -> Decimal:
    return (Decimal(paisa) / 100).quantize(Decimal("0.01"))


def to_out(e: Expense, viewer: Optional[User] = None, recorder: Optional[User] = None) -> ExpenseOut:
    can_review = bool(
        viewer is not None
        and e.status == ExpenseStatus.PENDING.value
        and not e.voided
        and denial_reason(viewer, Duty.APPROVE_EXPENSE, recorder) is None
    )
    return ExpenseOut(
        id=e.id, amount_rupees=_rs(e.amount_paisa), category=e.category, spent_on=e.spent_on,
        description=e.description, recorded_by_name=e.recorded_by_name, created_at=e.created_at,
        status=e.status, reviewed_by_name=e.reviewed_by_name, reviewed_at=e.reviewed_at, review_note=e.review_note,
        can_review=can_review, voided=e.voided, voided_at=e.voided_at, voided_by_name=e.voided_by_name,
        void_reason=e.void_reason,
    )


def _values(e: Expense) -> dict:
    return {"amount": _rs(e.amount_paisa), "category": CATEGORY_LABELS.get(e.category, i18n.both(e.category, e.category)),
            "description": e.description or "-"}


class ExpenseService:
    def list(
        self, session: Session, user: User, date_from: Optional[date], date_to: Optional[date],
        status_filter: Optional[str] = None,
    ) -> ExpenseList:
        _require_member(user)
        q = select(Expense)
        if date_from:
            q = q.where(Expense.spent_on >= date_from)
        if date_to:
            q = q.where(Expense.spent_on <= date_to)
        if status_filter:
            q = q.where(Expense.status == status_filter, Expense.voided == False)  # noqa: E712
        rows = session.exec(q.order_by(Expense.spent_on.desc(), Expense.created_at.desc())).all()
        recorders = {u.id: u for u in session.exec(select(User).where(User.id.in_({e.recorded_by for e in rows}))).all()} if rows else {}
        approved = [e for e in rows if not e.voided and e.status == ExpenseStatus.APPROVED.value]
        pending = [e for e in rows if not e.voided and e.status == ExpenseStatus.PENDING.value]
        by_cat: dict[str, int] = {}
        for e in approved:
            by_cat[e.category] = by_cat.get(e.category, 0) + e.amount_paisa
        return ExpenseList(
            items=[to_out(e, user, recorders.get(e.recorded_by)) for e in rows],
            total_rupees=_rs(sum(e.amount_paisa for e in approved)),
            pending_rupees=_rs(sum(e.amount_paisa for e in pending)),
            by_category={k: _rs(v) for k, v in by_cat.items()},
            can_record=can_record(user),
            can_approve=is_active_member(user) and may_perform_any(user, Duty.APPROVE_EXPENSE),
        )

    def pending_for(self, session: Session, user: User) -> int:
        """How many expenses this user could approve now (Home action item)."""
        if not may_perform_any(user, Duty.APPROVE_EXPENSE):
            return 0
        rows = session.exec(
            select(Expense).where(Expense.status == ExpenseStatus.PENDING.value, Expense.voided == False)  # noqa: E712
        ).all()
        return sum(1 for e in rows if denial_reason(user, Duty.APPROVE_EXPENSE, session.get(User, e.recorded_by)) is None)

    def create(self, session: Session, user: User, data: ExpenseCreate, background: Optional[BackgroundTasks] = None) -> Expense:
        _require_treasurer(user)
        today = to_local(datetime.now(timezone.utc)).date()
        if data.spent_on > today:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The expense date can't be in the future.")
        expense = Expense(
            amount_paisa=int((data.amount_rupees * 100).to_integral_value()),
            category=data.category.value,
            spent_on=data.spent_on,
            description=data.description,
            recorded_by=user.id,
            recorded_by_name=name_with_role(user) or f"{user.first_name} {user.last_name}".strip(),
            status=ExpenseStatus.PENDING.value,
        )
        session.add(expense)
        session.flush()
        notify(session, background, responsible_users(session, Duty.APPROVE_EXPENSE, user),
               "expense_awaiting_approval", NotificationType.EXPENSE, treasurer=expense.recorded_by_name, **_values(expense))
        session.commit()
        session.refresh(expense)
        return expense

    def _pending(self, session: Session, user: User, expense_id: uuid.UUID) -> tuple[Expense, Optional[User]]:
        _require_member(user)
        expense = session.get(Expense, expense_id)
        if expense is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found.")
        recorder = session.get(User, expense.recorded_by)
        require_duty(user, Duty.APPROVE_EXPENSE, recorder)
        if expense.voided:
            raise HTTPException(status.HTTP_409_CONFLICT, "This expense is already voided.")
        if expense.status != ExpenseStatus.PENDING.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "This expense has already been reviewed.")
        return expense, recorder

    def approve(self, session: Session, user: User, expense_id: uuid.UUID, background: Optional[BackgroundTasks] = None) -> Expense:
        expense, recorder = self._pending(session, user, expense_id)
        self._review(expense, user, ExpenseStatus.APPROVED, None)
        session.add(expense)
        notify(session, background, [recorder], "expense_approved", NotificationType.EXPENSE,
               reviewer=expense.reviewed_by_name, **_values(expense))
        session.commit()
        session.refresh(expense)
        return expense

    def reject(self, session: Session, user: User, expense_id: uuid.UUID, data: ExpenseReject,
               background: Optional[BackgroundTasks] = None) -> Expense:
        expense, recorder = self._pending(session, user, expense_id)
        self._review(expense, user, ExpenseStatus.REJECTED, data.reason.strip())
        session.add(expense)
        notify(session, background, [recorder], "expense_rejected", NotificationType.EXPENSE,
               reviewer=expense.reviewed_by_name, reason=expense.review_note, **_values(expense))
        session.commit()
        session.refresh(expense)
        return expense

    @staticmethod
    def _review(expense: Expense, user: User, outcome: ExpenseStatus, note: Optional[str]) -> None:
        expense.status = outcome.value
        expense.reviewed_by = user.id
        expense.reviewed_by_name = name_with_role(user)
        expense.reviewed_at = datetime.now(timezone.utc)
        expense.review_note = note

    def void(self, session: Session, user: User, expense_id: uuid.UUID, data: ExpenseVoid) -> Expense:
        _require_treasurer(user)
        expense = session.get(Expense, expense_id)
        if expense is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found.")
        if expense.voided:
            raise HTTPException(status.HTTP_409_CONFLICT, "This expense is already voided.")
        expense.voided = True
        expense.voided_at = datetime.now(timezone.utc)
        expense.voided_by_name = name_with_role(user)
        expense.void_reason = data.reason.strip()
        session.add(expense)
        session.commit()
        session.refresh(expense)
        return expense

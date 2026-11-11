"""
Read-only dashboard summaries (member Home, admin Overview).

Months are Nepal calendar months. Action items reuse the same duty /
visibility rules as the endpoints, so a count here always matches what the
corresponding review screen will list.
"""

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.models.deposit_model import Deposit, DepositVerificationStatus as DVS
from app.models.fine_model import Fine
from app.models.loan_model import Loan, LoanStatus
from app.models.loan_payment import LoanPayment, LoanPaymentStatus, LoanPaymentType
from app.models.policy.base_policy import PolicyStatus
from app.models.policy.deposit_policy import DepositPolicy, DepositScheduleType
from app.models.policy.policy_signature import PolicySignature, ProxyRequestStatus, SignatureStatus
from app.models.user_model import User
from app.schemas.dashboard_schema import (
    ActivityEvent,
    ActionItem,
    ActivityItem,
    AdminDashboard,
    AdminMonthPoint,
    LoanSummaryOut,
    MemberDashboard,
    MonthPoint,
    NextDue,
    OpenPolicy,
    RecentMember,
)
from app.services.deposit_service import DepositService
from app.services.duties import Duty, is_office_bearer, may_perform_any
from app.services.policy_lifecycle import current_deposit_policy
from app.services.loan_payment_service import LoanPaymentService
from app.services.loan_service import LoanService
from app.services.policy_signing_service import POLICY_MODELS, PolicySigningService, policy_label
from app.utils.deposit_date_utils import calculate_due_date, days_until_due
from app.utils.local_time import format_local, to_local

OPEN_LOAN_STATUSES = (LoanStatus.APPROVED, LoanStatus.ACTIVE)


def _rs(paisa) -> Decimal:
    return Decimal(int(paisa or 0)) / 100


def _month_key(dt: datetime) -> str:
    return to_local(dt).strftime("%Y-%m")


def _last_months(n: int = 12) -> list[str]:
    now = to_local(datetime.now(timezone.utc))
    y, m = now.year, now.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


def _loan_summary(session: Session, loan: Loan) -> LoanSummaryOut:
    payments = session.exec(
        select(LoanPayment).where(
            LoanPayment.loan_id == loan.id, LoanPayment.status == LoanPaymentStatus.VERIFIED
        )
    ).all()
    principal_paid = sum(p.amount_paisa for p in payments if p.payment_type == LoanPaymentType.PRINCIPAL)
    interest_paid = sum(p.amount_paisa for p in payments if p.payment_type != LoanPaymentType.PRINCIPAL)
    outstanding = 0 if loan.status == LoanStatus.PAID else max(0, loan.principal_paisa - principal_paid)
    progress = 100 if not loan.principal_paisa else round(100 * (loan.principal_paisa - outstanding) / loan.principal_paisa)
    return LoanSummaryOut(
        id=loan.id,
        status=loan.status.value,
        purpose=loan.purpose,
        principal=_rs(loan.principal_paisa),
        principal_paid=_rs(principal_paid),
        interest_paid=_rs(interest_paid),
        outstanding=_rs(outstanding),
        progress_pct=progress,
        interest_rate=loan.interest_rate,
        start_date=loan.start_date,
        maturity_date=loan.maturity_date,
        payments=len(payments),
    )


class DashboardService:
    # ------------------------------------------------------------------
    # Member
    # ------------------------------------------------------------------
    def member(self, session: Session, user: User) -> MemberDashboard:
        deposits = session.exec(select(Deposit).where(Deposit.user_id == user.id)).all()
        verified = [d for d in deposits if d.verification_status == DVS.VERIFIED]
        pending = [d for d in deposits if d.verification_status == DVS.PENDING]
        fines = session.exec(select(func.coalesce(func.sum(Fine.amount_paisa), 0)).where(Fine.user_id == user.id)).one()

        loans = session.exec(select(Loan).where(Loan.user_id == user.id)).all()
        open_loan = next((l for l in sorted(loans, key=lambda l: l.created_at, reverse=True) if l.status in OPEN_LOAN_STATUSES), None)
        loan_ids = [l.id for l in loans]
        payments = (
            session.exec(
                select(LoanPayment).where(LoanPayment.loan_id.in_(loan_ids))
            ).all()
            if loan_ids
            else []
        )

        months = _last_months()
        deposited, repaid = defaultdict(int), defaultdict(int)
        before = 0
        for d in verified:
            key = _month_key(d.deposited_date)
            if key < months[0]:
                before += d.amount_paisa
            deposited[key] += d.amount_paisa
        for p in payments:
            if p.status == LoanPaymentStatus.VERIFIED:
                repaid[_month_key(p.date)] += p.amount_paisa
        running, monthly = before, []
        for key in months:
            running += deposited[key]
            monthly.append(MonthPoint(month=key, deposited=_rs(deposited[key]), cumulative=_rs(running), repaid=_rs(repaid[key])))

        recent = sorted(
            [
                ActivityItem(date=d.deposited_date, kind="deposit", description="Deposit",
                             amount=_rs(d.amount_paisa), status=d.verification_status.value)
                for d in deposits
            ]
            + [
                ActivityItem(date=p.date, kind="loan_payment",
                             description=f"Loan {'principal' if p.payment_type == LoanPaymentType.PRINCIPAL else 'interest'} payment",
                             amount=_rs(p.amount_paisa), status=p.status.value)
                for p in payments
            ],
            key=lambda a: a.date,
            reverse=True,
        )[:6]

        return MemberDashboard(
            first_name=user.first_name,
            savings_total=_rs(sum(d.amount_paisa for d in verified)),
            deposits_count=len(verified),
            pending_amount=_rs(sum(d.amount_paisa for d in pending)),
            pending_count=len(pending),
            fines_total=_rs(fines),
            next_due=self._next_due(session, user, deposits),
            loan=_loan_summary(session, open_loan) if open_loan else None,
            loan_application_pending=any(l.status == LoanStatus.PENDING for l in loans),
            monthly=monthly,
            actions=self._actions(session, user, pending),
            recent=recent,
        )

    @staticmethod
    def _next_due(session: Session, user: User, deposits) -> Optional[NextDue]:
        """Next due date under the current deposit policy (the only one
        deposits can use)."""
        policy = current_deposit_policy(session)
        if policy is None:
            return None
        now = datetime.now(timezone.utc)
        due = calculate_due_date(policy, now)
        paid = any(
            d.policy_id == policy.policy_id
            and d.verification_status in (DVS.PENDING, DVS.VERIFIED)
            and to_local(d.due_deposit_date).date() == to_local(due).date()
            for d in deposits
        )
        return NextDue(
            due_date=due,
            amount=_rs(policy.amount_paisa),
            policy_label=policy_label("deposit", policy),
            paid=paid,
            days_left=days_until_due(due, now),
        )

    @staticmethod
    def _actions(session: Session, user: User, my_pending) -> list[ActionItem]:
        actions: list[ActionItem] = []
        signing = PolicySigningService()

        # Policies waiting for my signature
        rows = session.exec(
            select(PolicySignature).where(
                PolicySignature.user_id == user.id, PolicySignature.status == SignatureStatus.PENDING
            )
        ).all()
        for row in rows:
            model = POLICY_MODELS.get(row.policy_type)
            policy = session.exec(select(model).where(model.policy_id == row.policy_id)).first() if model else None
            if not policy or policy.status != PolicyStatus.FINALIZED or signing._deadline_passed(policy):
                continue
            actions.append(ActionItem(
                kind="sign_policy",
                title="Sign a new policy",
                detail=f"{policy_label(row.policy_type, policy)}. Signing closes {format_local(policy.signing_deadline)}.",
                link="/dashboard/policies",
                urgent=True,
            ))

        if is_office_bearer(user):
            if may_perform_any(user, Duty.VERIFY_DEPOSIT):
                n = len(DepositService().list_pending_review_deposits(session, user, 0, 1000))
                if n:
                    actions.append(ActionItem(kind="review_deposits", title="Deposits to verify",
                                              detail=f"{n} deposit{'s' if n != 1 else ''} waiting for your verification.",
                                              count=n, link="/dashboard/deposit?subtab=review", urgent=True))
            loans, _ = LoanService().get_pending_loans(session, 0, 1000, viewer=user)
            n = sum(1 for l in loans if l.viewer_can_verify_funds or l.viewer_can_decide)
            if n:
                actions.append(ActionItem(kind="review_loans", title="Loan applications to review",
                                          detail=f"{n} application{'s' if n != 1 else ''} waiting for you.",
                                          count=n, link="/dashboard/loans?subtab=review", urgent=True))
            if may_perform_any(user, Duty.REVIEW_LOAN_PAYMENT):
                _, n = LoanPaymentService().list_pending_payments(session, user, 0, 1000)
                if n:
                    actions.append(ActionItem(kind="review_payments", title="Loan payments to review",
                                              detail=f"{n} payment{'s' if n != 1 else ''} waiting for review.",
                                              count=n, link="/dashboard/loans", urgent=False))
            try:
                proxies = signing.list_proxy_requests(session, user, ProxyRequestStatus.PENDING)
            except HTTPException:
                proxies = []
            n = sum(1 for p in proxies if p.can_authorise)
            if n:
                actions.append(ActionItem(kind="authorise_proxy", title="Proxy signatures to authorise",
                                          detail=f"{n} request{'s' if n != 1 else ''} from the Admin need your decision.",
                                          count=n, link="/dashboard/policies", urgent=True))

        if my_pending:
            n = len(my_pending)
            actions.append(ActionItem(kind="pending_deposit", title="Deposit awaiting verification",
                                      detail=f"{n} of your deposits {'is' if n == 1 else 'are'} waiting for the Treasurer.",
                                      count=n, link="/dashboard/deposit?subtab=my", urgent=False))
        return actions

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------
    def admin(self, session: Session) -> AdminDashboard:
        users = session.exec(select(User)).all()
        this_month = _last_months(1)[0]

        def status(u: User) -> str:
            if u.disabled:
                return "disabled"
            if not u.is_approved:
                return "pending_approval"
            if not u.is_verified:
                return "unverified"
            return "active"

        deposits = session.exec(select(Deposit)).all()
        verified = [d for d in deposits if d.verification_status == DVS.VERIFIED]
        loans = session.exec(select(Loan)).all()
        open_loans = [l for l in loans if l.status in OPEN_LOAN_STATUSES]
        outstanding = sum(_loan_summary(session, l).outstanding for l in open_loans)

        months = _last_months()
        dep_by_month, disb_by_month, joined_by_month = defaultdict(int), defaultdict(int), defaultdict(int)
        for d in verified:
            dep_by_month[_month_key(d.deposited_date)] += d.amount_paisa
        for l in loans:
            if l.status in (LoanStatus.APPROVED, LoanStatus.ACTIVE, LoanStatus.PAID):
                disb_by_month[_month_key(l.approved_at or l.start_date)] += l.principal_paisa
        members = [u for u in users if status(u) == "active"]
        before = sum(1 for u in members if _month_key(u.joined_at) < months[0])
        for u in members:
            joined_by_month[_month_key(u.joined_at)] += 1
        running, monthly = before, []
        for key in months:
            running += joined_by_month[key]
            monthly.append(AdminMonthPoint(month=key, deposits=_rs(dep_by_month[key]), loans_disbursed=_rs(disb_by_month[key]),
                                           new_members=joined_by_month[key], total_members=running))

        signing = PolicySigningService()
        open_policies = []
        for policy_type, model in POLICY_MODELS.items():
            for p in session.exec(select(model).where(model.status == PolicyStatus.FINALIZED)).all():
                summary = signing.summary(session, policy_type, p.policy_id)
                if summary.status == PolicyStatus.FINALIZED:
                    open_policies.append(OpenPolicy(policy_type=policy_type, policy_id=p.policy_id, label=summary.label,
                                                    approved=summary.approved, required=summary.required,
                                                    rejected=summary.rejected, deadline=summary.signing_deadline))

        recent = sorted(users, key=lambda u: u.joined_at, reverse=True)[:6]
        return AdminDashboard(
            members_active=len(members),
            members_pending_approval=sum(1 for u in users if status(u) == "pending_approval"),
            members_unverified=sum(1 for u in users if status(u) == "unverified"),
            members_disabled=sum(1 for u in users if u.disabled),
            members_new_this_month=sum(1 for u in members if _month_key(u.joined_at) == this_month),
            savings_total=_rs(sum(d.amount_paisa for d in verified)),
            deposits_this_month=_rs(dep_by_month[this_month]),
            pending_deposits=sum(1 for d in deposits if d.verification_status == DVS.PENDING),
            loans_outstanding=outstanding,
            active_loans=len(open_loans),
            pending_loan_applications=sum(1 for l in loans if l.status == LoanStatus.PENDING),
            open_policies=open_policies,
            monthly=monthly,
            recent_members=[
                RecentMember(id=u.id, name=f"{u.first_name} {u.last_name}".strip(), email=u.email,
                             joined_at=u.joined_at, status=status(u))
                for u in recent
            ],
        )

    # ------------------------------------------------------------------
    # Admin activity log
    # ------------------------------------------------------------------
    def activity(self, session: Session, limit: int = 200) -> list[ActivityEvent]:
        """Recent events across the cooperative, newest first, derived from the
        records themselves (deposit verification time = last update time)."""
        users = {u.id: u for u in session.exec(select(User)).all()}
        name = lambda uid: (f"{users[uid].first_name} {users[uid].last_name}".strip() if uid in users else "Unknown")
        by_email = {u.email: f"{u.first_name} {u.last_name}".strip() for u in users.values()}
        ev: list[ActivityEvent] = []

        for u in users.values():
            ev.append(ActivityEvent(at=u.joined_at, type="member", actor=name(u.id), action="Registered"))
            if u.approved_at:
                ev.append(ActivityEvent(at=u.approved_at, type="member", actor=by_email.get(u.approved_by, u.approved_by or "Admin"),
                                        action=f"Approved {name(u.id)}'s membership"))

        for d in session.exec(select(Deposit)).all():
            ev.append(ActivityEvent(at=d.created_at or d.deposited_date, type="deposit", actor=name(d.user_id),
                                    action="Submitted a deposit", amount=_rs(d.amount_paisa), status="pending"))
            if d.verification_status != DVS.PENDING and d.updated_at:
                ev.append(ActivityEvent(at=d.updated_at, type="deposit", actor=d.verified_by or "Treasurer",
                                        action=f"{d.verification_status.value.title()} {name(d.user_id)}'s deposit",
                                        amount=_rs(d.amount_paisa), status=d.verification_status.value))

        for l in session.exec(select(Loan)).all():
            amt = _rs(l.principal_paisa)
            ev.append(ActivityEvent(at=l.created_at, type="loan", actor=name(l.user_id), action="Applied for a loan", amount=amt, status="pending"))
            if l.fund_verified_at:
                ev.append(ActivityEvent(at=l.fund_verified_at, type="loan", actor=by_email.get(l.fund_verified_by, l.fund_verified_by or "Treasurer"),
                                        action=f"Verified funds for {name(l.user_id)}'s loan", amount=amt))
            if l.approved_at:
                ev.append(ActivityEvent(at=l.approved_at, type="loan", actor=l.approved_by or "President",
                                        action=f"Approved {name(l.user_id)}'s loan", amount=amt, status="approved"))
            if l.rejected_at:
                ev.append(ActivityEvent(at=l.rejected_at, type="loan", actor=l.rejected_by or "President",
                                        action=f"Rejected {name(l.user_id)}'s loan", amount=amt, status="rejected"))

        loans = {l.id: l for l in session.exec(select(Loan)).all()}
        for p in session.exec(select(LoanPayment).where(LoanPayment.verified_at.is_not(None))).all():
            owner = name(loans[p.loan_id].user_id) if p.loan_id in loans else "a member"
            ev.append(ActivityEvent(at=p.verified_at, type="payment", actor=p.verified_by or "Treasurer",
                                    action=f"{p.status.value.title()} {owner}'s loan {p.payment_type.value} payment",
                                    amount=_rs(p.amount_paisa), status=p.status.value))

        for row in session.exec(select(PolicySignature).where(PolicySignature.signed_at.is_not(None))).all():
            model = POLICY_MODELS.get(row.policy_type)
            pol = session.exec(select(model).where(model.policy_id == row.policy_id)).first() if model else None
            label = policy_label(row.policy_type, pol) if pol else f"{row.policy_type} policy"
            verb = "Signed" if row.status == SignatureStatus.APPROVED else "Rejected"
            ev.append(ActivityEvent(at=row.signed_at, type="policy", actor=row.signer_name or name(row.user_id),
                                    action=f"{verb} the {label}" + (" (by proxy)" if row.proxy_request_id else ""),
                                    status=row.status.value))

        ev.sort(key=lambda e: e.at, reverse=True)
        return ev[:limit]

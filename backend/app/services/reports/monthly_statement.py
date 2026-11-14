"""
Monthly statement of accounts: the figures (no PDF, no HTTP).

The range is a From date and a To date (Nepal calendar days, inclusive). It
is split into AD calendar months; the first and last month are cut to the
range ("1 Nov 2026 - 14 Nov 2026"). For each such section and each member
(not the system admin account):

A. Summary, as at the end of the section
   capital_month     capital the member deposited in the section
   capital_total     all capital deposited up to the end of the month
   loans_issued      total of all loans issued to the member so far
   capital_due       deposits required so far that weren't paid (if any)
   capital_advance   capital paid beyond what was required so far (if any)

B. Accruals of the section
   principal_outstanding  loan principal still owed at the end of the section
   durations              each open loan: (months elapsed, term in months)
   interest_accrual       principal owed at the start of the section x yearly
                          rate / 12 x (days covered / days in the month); a
                          loan issued during the section accrues from then
   service_charge         loan service charges of loans issued in the section
   deposit_fine           late fines paid with deposits in the section

Rules
 * Only VERIFIED deposits and loan payments count: pending ones aren't money
   the cooperative has confirmed.
 * Capital = the deposit's regular + advance parts (Deposit.regular_paisa /
   advance_paisa); a voucher's fine and loan payments are not capital.
 * Required deposits: one per due date of the deposit policy in force (the
   adopted policy with the latest start covering that date), from the
   member's joining date. Due and advance are the shortfall / surplus of
   capital_total against that, so one of them is always zero.
 * A loan counts from when it was issued (disbursed, else approved); only
   approved, active and paid loans.
 * Amounts are integers in paisa; interest is rounded to the paisa per loan
   per month.

Everything is loaded once for the whole range and computed in memory: a small
cooperative's full history is a few thousand rows.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.deposit_model import Deposit, DepositVerificationStatus
from app.models.fine_model import Fine
from app.models.loan_model import Loan, LoanStatus
from app.models.loan_payment import LoanPayment, LoanPaymentStatus, LoanPaymentType
from app.models.policy.base_policy import PolicyStatus
from app.models.policy.deposit_policy import DepositPolicy
from app.models.user_model import User
from app.services.duties import is_system_admin
from app.utils.local_time import LOCAL_TZ, to_local

MAX_MONTHS = 24
MAX_DAYS = 731  # about 24 months
ISSUED_STATUSES = (LoanStatus.APPROVED, LoanStatus.ACTIVE, LoanStatus.PAID)
ADOPTED_POLICY = (PolicyStatus.ACTIVE, PolicyStatus.EXPIRED)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------
@dataclass
class SummaryRow:
    member_id: str
    member_name: str
    capital_month: int = 0
    capital_total: int = 0
    loans_issued: int = 0
    capital_due: int = 0
    capital_advance: int = 0


@dataclass
class AccrualRow:
    member_id: str
    member_name: str
    principal_outstanding: int = 0
    # (month of the loan this is, term in months) per open loan; month > term = past maturity
    durations: list[tuple[int, int]] = field(default_factory=list)
    interest_accrual: int = 0
    service_charge: int = 0
    deposit_fine: int = 0


@dataclass
class LoanAccrualRow:
    """One open loan in a month section (the loan-level schedule)."""

    loan_id: str
    reference: str  # "LN-1A2B3C4D", as on the loan agreement
    member_id: str
    member_name: str
    principal: int
    principal_outstanding: int
    interest_rate: Decimal  # % per year
    month: int  # month of the loan this is (1 = first)
    term: int  # term in months; month > term = past maturity
    interest_accrual: int
    service_charge: int

    @property
    def past_maturity(self) -> bool:
        return self.month > self.term


def loan_reference(loan_id) -> str:
    """The loan's reference, as printed on its agreement: LN-<first 8 of its id>."""
    return f"LN-{str(loan_id).split('-')[0].upper()}"


@dataclass
class MonthStatement:
    month: str  # "YYYY-MM"
    start: datetime  # UTC, start of the section (the month, cut to the range)
    end: datetime  # UTC, exclusive
    partial: bool  # the section doesn't cover the whole month
    to_date: bool  # the section ends after the report was generated
    summary: list[SummaryRow]
    accruals: list[AccrualRow]
    loans: list[LoanAccrualRow] = field(default_factory=list)

    @property
    def summary_total(self) -> SummaryRow:
        return _sum_rows(SummaryRow("", "Total"), self.summary,
                         ("capital_month", "capital_total", "loans_issued", "capital_due", "capital_advance"))

    @property
    def accrual_total(self) -> AccrualRow:
        return _sum_rows(AccrualRow("", "Total"), self.accruals,
                         ("principal_outstanding", "interest_accrual", "service_charge", "deposit_fine"))


@dataclass
class FinancialPosition:
    """Statement of Financial Position as at a moment (cash basis for income).

    Assets                                  Equity and liabilities
      deposit_receivables  required - paid    share_capital     required so far
      loans_outstanding    issued - repaid    capital_advance   paid - required
      equity_investment    (later)            retained_earnings income received
      cash                 money in - out     margin_loan       (later)

    cash = capital received + income received - loans paid out + principal
    repaid (a service charge deducted at payout is both less money out and
    income), so the two sides are equal by construction.
    """

    as_at: datetime  # exclusive: everything before this moment
    capital_received: int = 0
    share_capital: int = 0
    deposit_receivables: int = 0
    capital_advance: int = 0
    loans_paid_out: int = 0
    principal_repaid: int = 0
    fines_received: int = 0  # late deposit fines and loan penalties
    interest_received: int = 0
    service_charges_received: int = 0
    expenses_paid: int = 0  # non-voided expenses spent before as_at
    equity_investment: Optional[int] = None  # Investment in Equity Market (not yet tracked)
    equity_profit: Optional[int] = None  # its profit, part of retained earnings (not yet tracked)
    margin_loan: Optional[int] = None  # (not yet tracked)

    @property
    def loans_outstanding(self) -> int:
        return self.loans_paid_out - self.principal_repaid

    @property
    def income_received(self) -> int:
        return self.fines_received + self.interest_received + self.service_charges_received + (self.equity_profit or 0)

    @property
    def retained_earnings(self) -> int:
        """Income received less expenses paid."""
        return self.income_received - self.expenses_paid

    @property
    def cash(self) -> int:
        """Money in the bank: everything received, less loans paid out net of
        repayments (a deducted service charge never left the bank)."""
        return self.capital_received + self.retained_earnings - self.loans_outstanding - (self.equity_investment or 0)

    @property
    def total_assets(self) -> int:
        return self.deposit_receivables + self.loans_outstanding + (self.equity_investment or 0) + self.cash

    @property
    def total_equity_liabilities(self) -> int:
        return self.share_capital + self.capital_advance + self.retained_earnings + (self.margin_loan or 0)


@dataclass
class ExpenseRow:
    expense_id: str
    spent_on: date
    category: str
    description: Optional[str]
    amount: int
    recorded_by_name: str
    approved_by_name: Optional[str] = None


EXPENSE_CATEGORY_LABELS = {
    "meeting": "Meeting",
    "agm": "AGM",
    "gift": "Gift / welfare",
    "office": "Office & stationery",
    "bank_charges": "Bank charges",
    "transport": "Transport",
    "other": "Other",
}


@dataclass
class MonthlyStatement:
    period_from: str  # "YYYY-MM-DD", inclusive
    period_to: str  # "YYYY-MM-DD", inclusive
    generated_at: datetime
    months: list[MonthStatement]
    position_start: Optional["FinancialPosition"] = None  # as at the start of the From date
    position_end: Optional["FinancialPosition"] = None  # as at the end of the To date
    expenses: list[ExpenseRow] = field(default_factory=list)  # approved, spent during the period (not voided)
    # recorded but not yet approved by the President: not counted anywhere
    expenses_pending: list[ExpenseRow] = field(default_factory=list)

    @property
    def expenses_by_category(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for e in self.expenses:
            out[e.category] = out.get(e.category, 0) + e.amount
        return dict(sorted(out.items(), key=lambda kv: -kv[1]))

    @property
    def period_totals(self) -> dict[str, int]:
        """Flows summed over the period; balances as at the end of it."""
        last = self.months[-1]
        return {
            "capital_deposited": sum(m.summary_total.capital_month for m in self.months),
            "interest_accrual": sum(m.accrual_total.interest_accrual for m in self.months),
            "service_charge": sum(m.accrual_total.service_charge for m in self.months),
            "deposit_fine": sum(m.accrual_total.deposit_fine for m in self.months),
            "capital_total": last.summary_total.capital_total,
            "loans_issued": last.summary_total.loans_issued,
            "principal_outstanding": last.accrual_total.principal_outstanding,
            "expenses": sum(e.amount for e in self.expenses),
            "capital_due": last.summary_total.capital_due,
            "capital_advance": last.summary_total.capital_advance,
        }


def _sum_rows(total, rows, fields):
    for name in fields:
        setattr(total, name, sum(getattr(r, name) for r in rows))
    return total


# ---------------------------------------------------------------------------
# Range
# ---------------------------------------------------------------------------
def parse_day(value: str) -> date:
    try:
        d = date.fromisoformat(value)
        if not 2000 <= d.year <= 2100:
            raise ValueError
        return d
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Dates must look like 2026-11-14.")


def day_start(d: date) -> datetime:
    """00:00 Nepal time on `d`, as UTC."""
    return datetime.combine(d, datetime.min.time(), LOCAL_TZ).astimezone(timezone.utc)


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    """[first day 00:00, first day of next month 00:00) in Nepal time, as UTC."""
    first = date(year, month, 1)
    return day_start(first), day_start(first + relativedelta(months=1))


def sections(period_from: str, period_to: str, now: datetime) -> list[tuple[int, int, datetime, datetime, bool]]:
    """(year, month, start, end, partial) per calendar month in the range,
    the first and last cut to the range. Raises 400 for a bad range."""
    a, b = parse_day(period_from), parse_day(period_to)
    if b < a:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The To date must not be before the From date.")
    if b > to_local(now).date():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The report can't include future dates.")
    if (b - a).days + 1 > MAX_DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A report can cover at most 24 months.")
    out, y, m = [], a.year, a.month
    range_start, range_end = day_start(a), day_start(b + timedelta(days=1))
    while (y, m) <= (b.year, b.month):
        ms, me = month_bounds(y, m)
        start, end = max(ms, range_start), min(me, range_end)
        out.append((y, m, start, end, (start, end) != (ms, me)))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _name(user: User) -> str:
    return " ".join(p.strip() for p in (user.first_name, user.middle_name, user.last_name) if p and p.strip())


def issued_at(loan: Loan) -> datetime:
    return _utc(loan.disbursed_at or loan.approved_at or loan.start_date)


def term_months(loan: Loan) -> int:
    delta = relativedelta(to_local(loan.maturity_date), to_local(loan.start_date))
    return max(1, delta.years * 12 + delta.months + (1 if delta.days >= 15 else 0))


def required_due_dates(policies: list[DepositPolicy], until: datetime) -> list[tuple[datetime, int]]:
    """(due date, amount in paisa) for every due date up to `until`, under
    the adopted deposit policy in force on that date."""
    from app.utils.deposit_date_utils import calculate_due_date

    chosen: dict[tuple[int, int], tuple[datetime, datetime, int]] = {}
    for policy in policies:
        start = _utc(policy.effective_from)
        stop = min(_utc(policy.effective_to) or until, until)
        ref = start - timedelta(seconds=1)
        for _ in range(MAX_MONTHS * 20):
            try:
                due = _utc(calculate_due_date(policy, ref))
            except ValueError:
                break
            if due > stop:
                break
            key = (to_local(due).year, to_local(due).month)
            # Two policies on the same month: the one that started later wins
            if key not in chosen or start > chosen[key][0]:
                chosen[key] = (start, due, policy.amount_paisa)
            ref = due + timedelta(seconds=1)
    return sorted((due, amount) for _, due, amount in chosen.values())


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def report_members(session: Session) -> list[User]:
    """Members on the statement: approved accounts with a cooperative role,
    except the system administration account."""
    users = session.exec(select(User)).all()
    members = [
        u for u in users
        if u.cooperative_roles and u.is_approved and u.is_verified and not is_system_admin(u)
    ]
    return sorted(members, key=lambda u: _name(u).lower())


def build_monthly_statement(
    session: Session, period_from: str, period_to: str, now: Optional[datetime] = None
) -> MonthlyStatement:
    now = now or datetime.now(timezone.utc)
    parts = sections(period_from, period_to, now)
    range_end = parts[-1][3]

    members = report_members(session)
    ids = [u.id for u in members]

    deposits = session.exec(
        select(Deposit).where(
            Deposit.user_id.in_(ids),
            Deposit.verification_status == DepositVerificationStatus.VERIFIED,
            Deposit.deposited_date < range_end,
        )
    ).all()
    verified_deposit_ids = {d.id for d in deposits}
    deposit_owner = {d.id: (d.user_id, _utc(d.deposited_date)) for d in deposits}
    fines = [
        f for f in session.exec(select(Fine).where(Fine.deposit_id.in_(verified_deposit_ids))).all()
    ] if verified_deposit_ids else []

    loans = session.exec(
        select(Loan).where(Loan.user_id.in_(ids), Loan.status.in_(ISSUED_STATUSES))
    ).all()
    loans = [ln for ln in loans if issued_at(ln) < range_end]
    principal_payments: dict = defaultdict(list)  # loan id -> [(date, paisa)]
    income_payments: list[tuple[datetime, str, int]] = []  # (date, kind, paisa): interest, penalty, service charge
    if loans:
        for p in session.exec(
            select(LoanPayment).where(
                LoanPayment.loan_id.in_([ln.id for ln in loans]),
                LoanPayment.status == LoanPaymentStatus.VERIFIED,
            )
        ).all():
            if p.payment_type == LoanPaymentType.PRINCIPAL:
                principal_payments[p.loan_id].append((_utc(p.date), p.amount_paisa))
            else:
                income_payments.append((_utc(p.date), p.payment_type.value, p.amount_paisa))

    from app.models.expense_model import Expense

    last_day = to_local(range_end - timedelta(seconds=1)).date()
    all_expenses = session.exec(
        select(Expense).where(Expense.voided == False, Expense.spent_on <= last_day)  # noqa: E712
        .order_by(Expense.spent_on, Expense.created_at)
    ).all()
    # Only expenses the President approved count; pending ones are listed apart
    expenses = [e for e in all_expenses if e.status == "approved"]
    pending_expenses = [e for e in all_expenses if e.status == "pending"]

    policies = session.exec(select(DepositPolicy).where(DepositPolicy.status.in_(ADOPTED_POLICY))).all()
    due_dates = required_due_dates(list(policies), range_end)

    by_member_deposits = defaultdict(list)
    for d in deposits:
        by_member_deposits[d.user_id].append((_utc(d.deposited_date), d.regular_paisa + d.advance_paisa))
    by_member_fines = defaultdict(list)
    for f in fines:
        owner, when = deposit_owner[f.deposit_id]
        by_member_fines[owner].append((when, f.amount_paisa))
    by_member_loans = defaultdict(list)
    for ln in loans:
        by_member_loans[ln.user_id].append(ln)

    def owed(loan: Loan, at: datetime) -> int:
        paid = sum(amount for when, amount in principal_payments[loan.id] if when < at)
        return max(0, loan.principal_paisa - paid)

    result: list[MonthStatement] = []
    for year, month, start, end, partial in parts:
        days_in_month = calendar.monthrange(year, month)[1]
        # Share of the month this section covers (1 for a whole month)
        covered = Decimal(str((end - start).total_seconds() / 86400 / days_in_month))
        summary, accruals, loan_rows = [], [], []
        for u in members:
            joined = _utc(u.joined_at) or start
            if joined >= end:
                continue  # not a member yet
            name = _name(u)
            dep = by_member_deposits[u.id]
            capital_total = sum(a for when, a in dep if when < end)
            required = sum(a for due, a in due_dates if joined < due < end)
            member_loans = by_member_loans[u.id]
            summary.append(SummaryRow(
                member_id=str(u.id),
                member_name=name,
                capital_month=sum(a for when, a in dep if start <= when < end),
                capital_total=capital_total,
                loans_issued=sum(ln.principal_paisa for ln in member_loans if issued_at(ln) < end),
                capital_due=max(0, required - capital_total),
                capital_advance=max(0, capital_total - required),
            ))

            row = AccrualRow(member_id=str(u.id), member_name=name)
            for ln in member_loans:
                issued = issued_at(ln)
                if issued >= end:
                    continue
                rate = Decimal(str(ln.interest_rate)) / 100 / 12
                if issued < start:
                    opening = owed(ln, start)
                    if opening == 0:
                        continue  # repaid before this month
                    interest = Decimal(opening) * rate * covered
                else:
                    # Issued in this section: accrues for the days it was out
                    days_out = (end - issued).total_seconds() / 86400
                    interest = Decimal(ln.principal_paisa) * rate * Decimal(str(days_out / days_in_month))
                charge = (ln.service_charge_paisa or 0) if issued >= start else 0
                row.service_charge += charge
                row.interest_accrual += _round(interest)
                row.principal_outstanding += owed(ln, end)
                elapsed = relativedelta(to_local(end - timedelta(seconds=1)), to_local(issued))
                row.durations.append((elapsed.years * 12 + elapsed.months + 1, term_months(ln)))
                loan_rows.append(LoanAccrualRow(
                    loan_id=str(ln.id), reference=loan_reference(ln.id), member_id=str(u.id), member_name=name,
                    principal=ln.principal_paisa, principal_outstanding=owed(ln, end),
                    interest_rate=Decimal(str(ln.interest_rate)), month=row.durations[-1][0], term=row.durations[-1][1],
                    interest_accrual=_round(interest), service_charge=charge,
                ))
            row.deposit_fine = sum(a for when, a in by_member_fines[u.id] if start <= when < end)
            accruals.append(row)

        result.append(MonthStatement(
            month=f"{year:04d}-{month:02d}", start=start, end=end, partial=partial, to_date=end > now,
            summary=summary, accruals=accruals, loans=loan_rows,
        ))
    def position_at(cutoff: datetime) -> FinancialPosition:
        """Statement of Financial Position just before `cutoff`."""
        pos = FinancialPosition(as_at=cutoff)
        for u in members:
            joined = _utc(u.joined_at) or cutoff
            if joined >= cutoff:
                continue
            paid = sum(a for when, a in by_member_deposits[u.id] if when < cutoff)
            required = sum(a for due, a in due_dates if joined < due < cutoff)
            pos.capital_received += paid
            pos.share_capital += required
            pos.deposit_receivables += max(0, required - paid)
            pos.capital_advance += max(0, paid - required)
            pos.fines_received += sum(a for when, a in by_member_fines[u.id] if when < cutoff)
        for ln in loans:
            if issued_at(ln) >= cutoff:
                continue
            pos.loans_paid_out += ln.principal_paisa
            pos.principal_repaid += ln.principal_paisa - owed(ln, cutoff)
            if ln.service_charge_method != "deposit":
                pos.service_charges_received += ln.service_charge_paisa or 0  # deducted at payout
        for when, kind, amount in income_payments:
            if when >= cutoff:
                continue
            if kind == LoanPaymentType.INTEREST.value:
                pos.interest_received += amount
            elif kind == LoanPaymentType.SERVICE_CHARGE.value:
                pos.service_charges_received += amount
            else:
                pos.fines_received += amount  # loan penalties
        before = to_local(cutoff).date()  # cutoff is 00:00 NPT: expenses on earlier days
        pos.expenses_paid = sum(e.amount_paisa for e in expenses if e.spent_on < before)
        return pos

    return MonthlyStatement(
        period_from=parse_day(period_from).isoformat(), period_to=parse_day(period_to).isoformat(),
        generated_at=now, months=result,
        position_start=position_at(parts[0][2]), position_end=position_at(range_end),
        expenses=[
            ExpenseRow(expense_id=str(e.id), spent_on=e.spent_on, category=e.category, description=e.description,
                       amount=e.amount_paisa, recorded_by_name=e.recorded_by_name, approved_by_name=e.reviewed_by_name)
            for e in expenses if e.spent_on >= to_local(parts[0][2]).date()
        ],
        expenses_pending=[
            ExpenseRow(expense_id=str(e.id), spent_on=e.spent_on, category=e.category, description=e.description,
                       amount=e.amount_paisa, recorded_by_name=e.recorded_by_name)
            for e in pending_expenses if e.spent_on >= to_local(parts[0][2]).date()
        ],
    )


def first_day(session: Session) -> str:
    """The earliest day with data (for the date pickers)."""
    candidates = [
        session.exec(select(Deposit.deposited_date).order_by(Deposit.deposited_date)).first(),
        session.exec(select(Loan.start_date).order_by(Loan.start_date)).first(),
        session.exec(select(DepositPolicy.effective_from).order_by(DepositPolicy.effective_from)).first(),
    ]
    dates = [to_local(_utc(d)) for d in candidates if d]
    first = min(dates) if dates else to_local(datetime.now(timezone.utc))
    return first.date().isoformat()


__all__ = [
    "MonthlyStatement", "MonthStatement", "SummaryRow", "AccrualRow", "FinancialPosition", "LoanAccrualRow",
    "loan_reference", "ExpenseRow", "EXPENSE_CATEGORY_LABELS",
    "build_monthly_statement", "first_day", "month_bounds", "required_due_dates", "sections", "MAX_DAYS",
]

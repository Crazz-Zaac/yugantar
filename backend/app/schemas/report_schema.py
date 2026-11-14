import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.services.reports.monthly_statement import (
    AccrualRow,
    FinancialPosition,
    LoanAccrualRow,
    MonthlyStatement,
    MonthStatement,
    SummaryRow,
)


def _rs(paisa: int) -> Decimal:
    return (Decimal(paisa) / 100).quantize(Decimal("0.01"))


DAY = r"^\d{4}-\d{2}-\d{2}$"


class ReportRequest(BaseModel):
    date_from: str = Field(pattern=DAY, examples=["2026-09-01"])
    date_to: str = Field(pattern=DAY, examples=["2026-11-14"])


class SummaryRowOut(BaseModel):
    member_id: str
    member_name: str
    capital_month: Decimal
    capital_total: Decimal
    loans_issued: Decimal
    capital_due: Decimal
    capital_advance: Decimal

    @classmethod
    def of(cls, r: SummaryRow) -> "SummaryRowOut":
        return cls(member_id=r.member_id, member_name=r.member_name, capital_month=_rs(r.capital_month),
                   capital_total=_rs(r.capital_total), loans_issued=_rs(r.loans_issued),
                   capital_due=_rs(r.capital_due), capital_advance=_rs(r.capital_advance))


class LoanDuration(BaseModel):
    month: int  # month of the loan this is (1 = first)
    term: int  # term in months; month > term = past maturity


class AccrualRowOut(BaseModel):
    member_id: str
    member_name: str
    principal_outstanding: Decimal
    durations: list[LoanDuration]
    interest_accrual: Decimal
    service_charge: Decimal
    deposit_fine: Decimal

    @classmethod
    def of(cls, r: AccrualRow) -> "AccrualRowOut":
        return cls(member_id=r.member_id, member_name=r.member_name,
                   principal_outstanding=_rs(r.principal_outstanding),
                   durations=[LoanDuration(month=k, term=n) for k, n in r.durations],
                   interest_accrual=_rs(r.interest_accrual), service_charge=_rs(r.service_charge),
                   deposit_fine=_rs(r.deposit_fine))


class LoanAccrualOut(BaseModel):
    loan_id: str
    reference: str
    member_id: str
    member_name: str
    principal: Decimal
    principal_outstanding: Decimal
    interest_rate: Decimal
    month: int
    term: int
    interest_accrual: Decimal
    service_charge: Decimal

    @classmethod
    def of(cls, r: LoanAccrualRow) -> "LoanAccrualOut":
        return cls(loan_id=r.loan_id, reference=r.reference, member_id=r.member_id, member_name=r.member_name,
                   principal=_rs(r.principal), principal_outstanding=_rs(r.principal_outstanding),
                   interest_rate=r.interest_rate, month=r.month, term=r.term,
                   interest_accrual=_rs(r.interest_accrual), service_charge=_rs(r.service_charge))


class MonthOut(BaseModel):
    month: str
    start: datetime
    end: datetime
    partial: bool  # doesn't cover the whole month
    to_date: bool  # ends after the report was made
    summary: list[SummaryRowOut]
    summary_total: SummaryRowOut
    accruals: list[AccrualRowOut]
    accrual_total: AccrualRowOut
    loans: list[LoanAccrualOut]

    @classmethod
    def of(cls, m: MonthStatement) -> "MonthOut":
        return cls(month=m.month, start=m.start, end=m.end, partial=m.partial, to_date=m.to_date,
                   summary=[SummaryRowOut.of(r) for r in m.summary], summary_total=SummaryRowOut.of(m.summary_total),
                   accruals=[AccrualRowOut.of(r) for r in m.accruals], accrual_total=AccrualRowOut.of(m.accrual_total),
                   loans=[LoanAccrualOut.of(r) for r in m.loans])


class PositionOut(BaseModel):
    """Statement of Financial Position (rupees; None = not tracked yet)."""
    as_at: datetime  # exclusive
    deposit_receivables: Decimal
    loans_outstanding: Decimal
    equity_investment: Optional[Decimal]
    cash: Decimal
    total_assets: Decimal
    share_capital: Decimal
    capital_advance: Decimal
    retained_earnings: Decimal
    margin_loan: Optional[Decimal]
    total_equity_liabilities: Decimal
    # schedules
    capital_received: Decimal
    loans_paid_out: Decimal
    principal_repaid: Decimal
    fines_received: Decimal
    interest_received: Decimal
    service_charges_received: Decimal
    equity_profit: Optional[Decimal]
    income_received: Decimal
    expenses_paid: Decimal

    @classmethod
    def of(cls, p: FinancialPosition) -> "PositionOut":
        opt = lambda v: None if v is None else _rs(v)
        return cls(
            as_at=p.as_at, deposit_receivables=_rs(p.deposit_receivables), loans_outstanding=_rs(p.loans_outstanding),
            equity_investment=opt(p.equity_investment), cash=_rs(p.cash), total_assets=_rs(p.total_assets),
            share_capital=_rs(p.share_capital), capital_advance=_rs(p.capital_advance),
            retained_earnings=_rs(p.retained_earnings), margin_loan=opt(p.margin_loan),
            total_equity_liabilities=_rs(p.total_equity_liabilities), capital_received=_rs(p.capital_received),
            loans_paid_out=_rs(p.loans_paid_out), principal_repaid=_rs(p.principal_repaid),
            fines_received=_rs(p.fines_received), interest_received=_rs(p.interest_received),
            service_charges_received=_rs(p.service_charges_received), equity_profit=opt(p.equity_profit),
            income_received=_rs(p.income_received), expenses_paid=_rs(p.expenses_paid),
        )


class ExpenseRowOut(BaseModel):
    expense_id: str
    spent_on: date
    category: str
    description: Optional[str]
    amount: Decimal
    recorded_by_name: str
    approved_by_name: Optional[str] = None


class StatementOut(BaseModel):
    period_from: str
    period_to: str
    generated_at: datetime
    months: list[MonthOut]
    period_totals: dict[str, Decimal]
    position_start: PositionOut
    position_end: PositionOut
    expenses: list[ExpenseRowOut]
    expenses_pending: list[ExpenseRowOut]
    expenses_by_category: dict[str, Decimal]

    @classmethod
    def of(cls, s: MonthlyStatement) -> "StatementOut":
        return cls(period_from=s.period_from, period_to=s.period_to, generated_at=s.generated_at,
                   months=[MonthOut.of(m) for m in s.months],
                   period_totals={k: _rs(v) for k, v in s.period_totals.items()},
                   position_start=PositionOut.of(s.position_start), position_end=PositionOut.of(s.position_end),
                   expenses=[ExpenseRowOut(expense_id=e.expense_id, spent_on=e.spent_on, category=e.category,
                                           description=e.description, amount=_rs(e.amount),
                                           recorded_by_name=e.recorded_by_name, approved_by_name=e.approved_by_name)
                             for e in s.expenses],
                   expenses_pending=[ExpenseRowOut(expense_id=e.expense_id, spent_on=e.spent_on, category=e.category,
                                                   description=e.description, amount=_rs(e.amount),
                                                   recorded_by_name=e.recorded_by_name) for e in s.expenses_pending],
                   expenses_by_category={k: _rs(v) for k, v in s.expenses_by_category.items()})


class ReportOptions(BaseModel):
    first_date: str  # earliest day with data
    last_date: str  # today (Nepal)
    max_days: int


class GeneratedReportOut(BaseModel):
    id: uuid.UUID
    kind: str
    reference: str
    period_from: str
    period_to: str
    generated_by_name: str
    generated_at: datetime
    size_bytes: int
    sha256: str

    model_config = {"from_attributes": True}

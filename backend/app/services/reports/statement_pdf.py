"""
Financial reports as official PDFs.

  Monthly Financial Statement  member capital and loans, per month section
  Monthly Accrual Report       member summary + loan-level schedule, per month section
  Statement of Financial Position  with schedules and a cash reconciliation
  Complete Financial Report    executive summary + all three + one approval

Layout (shared by all):
  * compact letterhead on every page (logo, name, report title, reference,
    date); the complete report's first page is an executive summary cover
  * a type scale: title 20 / section 13 / subsection 10.5 / body 9 / table 8.5
    / notes 8
  * restrained tables: light header, zebra rows, shaded bold totals,
    right-aligned amounts
  * approval boxes, then numbered notes in three groups (accounting basis,
    data limitations, document verification)
  * compact footer: report, reference, page x of y, one verification line

The figures come from services/reports/monthly_statement.py; nothing here
calculates.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Iterable, Optional

from fpdf import FPDF
from fpdf.fonts import FontFace

from app.services.policy_document import (
    BLUE,
    DEVANAGARI_FONT,
    GREEN,
    INK,
    LATIN_FALLBACK_FONT,
    LOGO_PATH,
    MUTED,
    ORG_NAME,
    RED,
    _latin1,
    ne_date,
    rs,
)
from app.services.reports.monthly_statement import (
    EXPENSE_CATEGORY_LABELS,
    AccrualRow,
    MonthlyStatement,
    MonthStatement,
)
from app.utils.local_time import format_local, to_local

FINANCIAL_STATEMENT = "financial_statement"
ACCRUAL_REPORT = "accrual_report"
FINANCIAL_POSITION = "financial_position"
COMPLETE_REPORT = "complete_report"  # all of the above in one PDF

TITLES = {
    FINANCIAL_STATEMENT: "Monthly Financial Statement",
    ACCRUAL_REPORT: "Monthly Accrual Report",
    FINANCIAL_POSITION: "Statement of Financial Position",
    COMPLETE_REPORT: "Complete Financial Report",
    "meeting_minutes": "Minutes of Meeting",
}
SUBTITLES = {
    FINANCIAL_STATEMENT: "Member capital contributions, loans issued, outstanding capital and capital paid in advance",
    ACCRUAL_REPORT: "Principal outstanding, interest accrual, renewal / service charges and deposit fines",
}

# Colours (the logo's blue, red, green; restrained greys)
SOFT_BLUE = (232, 238, 252)  # table header, section rows
TOTAL_FILL = (238, 242, 250)
ZEBRA = (248, 249, 251)
RULE = (218, 222, 230)
MID = (88, 94, 104)

TABLE_HEAD = FontFace(emphasis="BOLD", color=INK, fill_color=SOFT_BLUE, size_pt=8)
TOTAL = FontFace(emphasis="BOLD", fill_color=TOTAL_FILL)
SECTION_ROW = FontFace(emphasis="BOLD", color=BLUE, fill_color=SOFT_BLUE)


# ---------------------------------------------------------------------------
# Notes: (accounting basis, data limitations) per report
# ---------------------------------------------------------------------------
NOTES = {
    FINANCIAL_POSITION: (
        (
            "Income is recognised when received (cash basis): late deposit fines paid with verified deposits, verified interest "
            "and penalty payments, and loan service charges, whether deducted from the payout or paid later with a deposit.",
            "Share Capital is the total of deposits each member was required to make so far under the deposit policy in "
            "force on each due date. What was not paid is shown as a receivable; what was paid beyond it is Capital Advance.",
            "Investment (Loan to Members) is the principal still owed: loans paid out less principal repaid.",
            "Cash / Bank balance = capital received + income received - principal outstanding. A service charge deducted "
            "at payout is both income and less money paid out.",
            "Income received versus income accrued: Retained Earnings include only income actually received. Interest "
            "accrued (earned on loans whether or not paid, as in the Monthly Accrual Report) is not included; the memo "
            "under Schedule A shows the difference for the period. The statement does not show interest receivable.",
            "Each table states its measure: activity during the period, cumulative to a date, or a balance as at a date.",
            "Expenses are recorded by the Treasurer and approved by the President (the Secretary when the President "
            "recorded it). Only approved expenses reduce Retained Earnings and the cash / bank balance, on the day they "
            "were paid; expenses awaiting approval are listed separately and not counted; voided and rejected ones are "
            "excluded.",
        ),
        (
            "There is no opening balance or bank statement in the system yet: the cash / bank balance is derived from the "
            "recorded transactions and is only as complete as those records.",
            "Investment in Equity Market, its profit and Margin Loan are not tracked yet and are shown as '-'.",
        ),
    ),
    FINANCIAL_STATEMENT: (
        (
            "Capital is the regular and advance part of each deposit; late deposit fines and loan payments in the same voucher are "
            "not capital.",
            "Outstanding capital contribution / capital paid in advance compare the cumulative capital deposited with the "
            "deposits required by the deposit policy in force on each due date since the member joined; at most one of "
            "the two is non-zero.",
            "Cumulative loans issued: approved, active and repaid loans issued to the member up to the end of the section.",
        ),
        (),
    ),
    ACCRUAL_REPORT: (
        (
            "Interest accrual: principal owed at the start of the section x yearly rate / 12, pro-rated by the days the "
            "section covers; a loan issued during the section accrues from that day.",
            "Loan renewal / service charge: the one-off charge (loan policy %, fixed on the loan) in the section in which "
            "the loan was issued.",
            "Month of term: the month of the loan the section falls in, against its term (e.g. 3 of 12); loans past their "
            "maturity date are marked.",
        ),
        ("Interest accrual is interest earned on the loans for the period whether or not it has been paid; it is not "
         "income received. Only interest actually received is part of Retained Earnings in the Statement of Financial "
         "Position.",),
    ),
}
COMMON_LIMITATIONS = (
    "Only deposits and loan payments verified by the Treasurer are included; pending and rejected ones are not.",
    "Members are all approved members except the system administration account.",
    "Dates are Nepal time (NPT). The period is split into calendar months; the first and last are cut to the From and "
    "To dates. Amounts are in Nepali rupees; amounts in brackets are negative.",
)


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------
def money(paisa: Optional[int], blank_zero: bool = True) -> str:
    """'1,00,000.00' (Nepali grouping, two decimals); '-' for nothing / not tracked; (x) when negative."""
    if paisa is None or (not paisa and blank_zero):
        return "-"
    text = rs(Decimal(abs(paisa)) / 100).removeprefix("Rs. ")
    text = text if "." in text else f"{text}.00"
    return f"({text})" if paisa < 0 else text


def amount(paisa: Optional[int]) -> str:
    return money(paisa, blank_zero=False)


def _day(dt: datetime) -> str:
    d = to_local(dt)
    return f"{d.day} {d:%b %Y}"


def _long_day(dt: datetime) -> str:
    d = to_local(dt)
    return f"{d.day} {d:%B %Y}"


def period_text(statement: MonthlyStatement) -> str:
    """'1 Sep 2026 - 14 Nov 2026'."""
    return f"{_day(statement.months[0].start)} - {_day(statement.months[-1].end - timedelta(seconds=1))}"


def _bs(dt: datetime) -> str:
    return ne_date(dt).split(" (")[0]


def section_title(m: MonthStatement) -> str:
    """'November 2026  -  1-14 Nov (to date)'."""
    first = to_local(m.start)
    last = to_local(m.end - timedelta(seconds=1))
    span = "whole month" if not m.partial else f"{first.day}-{last.day} {last:%b}"
    return f"{first:%B %Y}  -  {span}{' (to date)' if m.to_date else ''}"


def bs_span(m: MonthStatement) -> str:
    return f"{_bs(m.start)} - {_bs(m.end - timedelta(seconds=1)).replace('वि.सं. ', '')}"


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------
class _ReportDoc(FPDF):
    """A4 with a compact letterhead and footer; page 1 of the complete report
    is a cover and has neither."""

    title_text = ""
    reference = ""
    issued = ""
    cover = False

    def header(self):
        if self.cover and self.page_no() == 1:
            return
        top = 8
        if LOGO_PATH.is_file():
            self.image(str(LOGO_PATH), x=self.l_margin, y=top, h=11)
        self.set_xy(self.l_margin + 13, top + 0.5)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*BLUE)
        self.cell(60, 5.5, "YUGANTAR", new_x="LEFT", new_y="NEXT")
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(60, 4, "Cooperative")
        # Right: title, reference and date
        self.set_xy(self.w - self.r_margin - 120, top + 0.5)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*INK)
        self.cell(120, 5.5, _latin1(self.title_text), align="R", new_x="LEFT", new_y="NEXT")
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(120, 4, _latin1(f"Ref. {self.reference}  |  {self.issued}"), align="R")
        _tricolour(self, top + 13.5, 0.7)
        self.set_xy(self.l_margin, top + 18)
        self.set_text_color(*INK)

    def footer(self):
        if self.cover and self.page_no() == 1:
            return
        self.set_y(-13)
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(1.2)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*MUTED)
        self.cell(0, 3.6, _latin1(f"{ORG_NAME}  |  {self.title_text}  |  Ref. {self.reference}"))
        self.set_x(self.l_margin)
        self.cell(0, 3.6, f"Page {self.page_no()} of {{nb}}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 6.5)
        self.cell(0, 3.2, "Verification: this file's SHA-256 checksum is recorded under its reference in the Yugantar Report Archive.")


def _tricolour(pdf: FPDF, y: float, height: float):
    width = pdf.w - pdf.l_margin - pdf.r_margin
    for i, colour in enumerate((BLUE, RED, GREEN)):
        pdf.set_fill_color(*colour)
        pdf.rect(pdf.l_margin + i * width / 3, y, width / 3, height, style="F")


def _new_doc(kind: str, reference: str, generated_at: datetime, orientation: str) -> _ReportDoc:
    pdf = _ReportDoc(orientation=orientation, format="A4")
    pdf.title_text = TITLES[kind]
    pdf.reference = reference
    pdf.issued = _day(generated_at)
    pdf.add_font("NotoDeva", fname=str(DEVANAGARI_FONT))
    pdf.add_font("NotoLatin", fname=str(LATIN_FALLBACK_FONT))
    pdf.set_margins(15, 27, 15)
    pdf.set_auto_page_break(True, margin=17)
    pdf.set_author(ORG_NAME)
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.2)
    return pdf


# ---------------------------------------------------------------------------
# Typography
# ---------------------------------------------------------------------------
def _devanagari(pdf: FPDF, text: str, size: float = 8.5, color=MUTED, h: float = 5):
    pdf.set_font("NotoDeva", "", size)
    pdf.set_text_color(*color)
    pdf.set_fallback_fonts(["NotoLatin"])
    pdf.set_text_shaping(True)
    pdf.cell(0, h, text, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_shaping(False)
    pdf.set_fallback_fonts([])
    pdf.set_text_color(*INK)


def _title(pdf: FPDF, text: str):
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*INK)
    pdf.cell(0, 10, _latin1(text), new_x="LMARGIN", new_y="NEXT")


def _section(pdf: FPDF, text: str, sub: Optional[str] = None, outline: bool = False):
    """A numbered part or major section: blue, with a rule under it."""
    if outline:
        pdf.start_section(_latin1(text))
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*BLUE)
    pdf.cell(0, 7.5, _latin1(text), new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*BLUE)
    pdf.set_line_width(0.4)
    pdf.line(pdf.l_margin, pdf.get_y() + 0.5, pdf.l_margin + 40, pdf.get_y() + 0.5)
    pdf.set_line_width(0.2)
    pdf.set_draw_color(*RULE)
    pdf.ln(2.5)
    pdf.set_text_color(*INK)
    if sub:
        _small(pdf, sub)
        pdf.ln(1)


def _subsection(pdf: FPDF, text: str, devanagari: Optional[str] = None):
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(0, 6, _latin1(text), new_x="LMARGIN", new_y="NEXT")
    if devanagari:
        _devanagari(pdf, devanagari, 8, h=4.5)


def _small(pdf: FPDF, text: str, color=MID, size: float = 8.5):
    pdf.set_font("Helvetica", "", size)
    pdf.set_text_color(*color)
    pdf.multi_cell(0, 4.4, _latin1(text), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)


def _caption(pdf: FPDF, parts: list[tuple[str, str]]):
    """Under a table: what kind of measure each column / row is.
    `parts`: (basis, columns), basis like "During the period (1 Sep - 30 Sep 2026)",
    "Cumulative to 30 Sep 2026" or "As at 30 Sep 2026"."""
    pdf.ln(0.8)
    pdf.set_text_color(*MID)
    pdf.set_x(pdf.l_margin)
    line = []
    for basis, cols in parts:
        line.append((basis, cols))
    pdf.set_font("Helvetica", "", 7.3)
    text = "   ".join(f"**{_latin1(b)}:** {_latin1(c)}." for b, c in line)
    pdf.multi_cell(0, 3.7, text, markdown=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)


def _section_span(m: MonthStatement) -> tuple[str, str]:
    """('1 Sep - 30 Sep 2026', '30 Sep 2026') for a month section."""
    first, last = m.start, m.end - timedelta(seconds=1)
    return f"{to_local(first).day} {to_local(first):%b} - {_day(last)}", _day(last)


def _keep(pdf: FPDF, height: float):
    """Start a new page unless `height` mm still fit."""
    if pdf.will_page_break(height):
        pdf.add_page()


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------
def _table(pdf: FPDF, widths, aligns, head, rows, total=None, width=None, zebra=True):
    """A restrained table: light header, zebra rows, shaded total row.
    `rows` items are lists of cell texts, or ("section", label) / ("style", style, cells)."""
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_draw_color(*RULE)
    pdf.set_fill_color(255, 255, 255)  # nothing else's fill colour leaks into the rows
    with pdf.table(
        width=width or pdf.epw,
        align="LEFT",
        col_widths=widths,
        text_align=aligns,
        line_height=4.6,
        borders_layout="HORIZONTAL_LINES",
        headings_style=TABLE_HEAD,
        cell_fill_color=ZEBRA if zebra else (255, 255, 255),
        cell_fill_mode="ROWS",
        v_align="MIDDLE",
        padding=(1.1, 1.6),
        first_row_as_headings=head is not None,
    ) as table:
        if head is not None:
            r = table.row()
            for h in head:
                r.cell(_latin1(h))
        for item in rows:
            if isinstance(item, tuple) and item[0] == "section":
                table.row().cell(_latin1(item[1]), style=SECTION_ROW, colspan=len(widths))
            elif isinstance(item, tuple) and item[0] == "style":
                r = table.row(style=item[1])
                for c in item[2]:
                    r.cell(_latin1(c))
            else:
                r = table.row()
                for c in item:
                    r.cell(_latin1(c))
        if total is not None:
            r = table.row(style=TOTAL)
            for c in total:
                r.cell(_latin1(c))


def _side_by_side(pdf: FPDF, draw_left, draw_right, gap: float = 8):
    """Draw two blocks in half-width columns from the same y; continue below the taller."""
    y0 = pdf.get_y()
    left_margin, right_margin = pdf.l_margin, pdf.r_margin
    half = (pdf.epw - gap) / 2
    # Left column: narrow the right margin so text wraps inside the column
    pdf.set_right_margin(right_margin + half + gap)
    draw_left(half)
    y_left = pdf.get_y()
    pdf.set_right_margin(right_margin)
    pdf.set_y(y0)
    pdf.set_left_margin(left_margin + half + gap)
    pdf.set_x(left_margin + half + gap)
    draw_right(half)
    y_right = pdf.get_y()
    pdf.set_left_margin(left_margin)
    pdf.set_xy(left_margin, max(y_left, y_right))


# ---------------------------------------------------------------------------
# Parts
# ---------------------------------------------------------------------------
def _write_position(pdf: FPDF, statement: MonthlyStatement, number: str = "", outline: bool = False,
                    heading: bool = True):
    end, start = statement.position_end, statement.position_start
    cur, prev = end.as_at - timedelta(seconds=1), start.as_at - timedelta(seconds=1)
    sub = f"As at {_long_day(cur)}, with comparative figures as at {_long_day(prev)} (the day before the period)."
    if heading:
        _section(pdf, f"{number}Statement of Financial Position", sub, outline=outline)
    else:
        _small(pdf, sub)
        pdf.ln(1)
    landscape = pdf.w > pdf.h
    widths = (130, 16, 52, 52) if landscape else (86, 12, 38, 38)
    _table(
        pdf, widths, ("LEFT", "CENTER", "RIGHT", "RIGHT"),
        ("Particulars", "Sch.", _day(cur), _day(prev)),
        [
            ("section", "ASSETS"),
            ["Deposit (Share Capital) receivables", "", amount(end.deposit_receivables), amount(start.deposit_receivables)],
            ["Investment (Loan to Members)", "B", amount(end.loans_outstanding), amount(start.loans_outstanding)],
            ["Investment in Equity Market", "", money(end.equity_investment), money(start.equity_investment)],
            ["Cash / Bank balance", "C", amount(end.cash), amount(start.cash)],
            ("style", TOTAL, ["Total assets", "", amount(end.total_assets), amount(start.total_assets)]),
            ("section", "EQUITY AND LIABILITIES"),
            ["Share Capital", "", amount(end.share_capital), amount(start.share_capital)],
            ["Capital Advance", "", amount(end.capital_advance), amount(start.capital_advance)],
            ["Retained Earnings (income received less expenses)", "A", amount(end.retained_earnings),
             amount(start.retained_earnings)],
            ["Margin Loan", "", money(end.margin_loan), money(start.margin_loan)],
            ("style", TOTAL, ["Total equity and liabilities", "", amount(end.total_equity_liabilities),
                              amount(start.total_equity_liabilities)]),
        ],
        width=sum(widths), zebra=False,
    )
    _caption(pdf, [(f"As at {_day(cur)} and {_day(prev)}", "every line is a closing balance on that date, not activity "
                    "during the period")])
    balanced = end.total_assets == end.total_equity_liabilities and start.total_assets == start.total_equity_liabilities
    pdf.ln(1.5)
    _small(pdf, "Total assets equal total equity and liabilities at both dates." if balanced
           else "Warning: the statement does not balance; please report this.", color=MID if balanced else RED, size=8)

    # Schedules: A and B side by side (landscape), C (a cash reconciliation) full width
    pdf.ln(4)
    _keep(pdf, 70)
    _subsection(pdf, "Schedules")
    pdf.ln(1)

    totals = statement.period_totals
    period = f"{_day(start.as_at)} - {_day(cur)}"

    def schedule_a(w):
        _small(pdf, "A. Retained Earnings (income received less expenses, cash basis)", color=INK, size=9)
        _table(pdf, (w * 0.56, w * 0.22, w * 0.22), ("LEFT", "RIGHT", "RIGHT"), ("", _day(cur), _day(prev)), [
            ["Late deposit fines and loan penalties", amount(end.fines_received), amount(start.fines_received)],
            ["Loan interest", amount(end.interest_received), amount(start.interest_received)],
            ["Loan renewal / service charges", amount(end.service_charges_received), amount(start.service_charges_received)],
            ["Profit from Investment in Equity Market", money(end.equity_profit), money(start.equity_profit)],
            ("style", FontFace(emphasis="BOLD"), ["Income received", amount(end.income_received), amount(start.income_received)]),
            ["Less: expenses paid (Schedule D)", amount(-end.expenses_paid), amount(-start.expenses_paid)],
        ], total=["Retained Earnings", amount(end.retained_earnings), amount(start.retained_earnings)], width=w)
        _caption(pdf, [("Cumulative to each date", "income actually received and expenses paid since records began; "
                        "interest earned but not yet paid is not included")])
        # Income received vs income accrued, for the period
        accrued = totals["interest_accrual"]
        received = end.interest_received - start.interest_received
        pdf.ln(3)
        _small(pdf, f"Memo: interest earned vs received ({period})", color=INK, size=9)
        _table(pdf, (w * 0.72, w * 0.28), ("LEFT", "RIGHT"), None, [
            ["Interest accrued (earned on loans during the period)", amount(accrued)],
            ["Interest received during the period (in Schedule A)", amount(received)],
        ], total=["Earned less received (not in Retained Earnings)", amount(accrued - received)], width=w)
        _caption(pdf, [("During the period", "accrued interest is earned, not necessarily received; only received "
                        "interest is income in this statement")])

    def schedule_b(w):
        _small(pdf, "B. Loans to Members", color=INK, size=9)
        _table(pdf, (w * 0.56, w * 0.22, w * 0.22), ("LEFT", "RIGHT", "RIGHT"), ("", _day(cur), _day(prev)), [
            ["Loans paid out", amount(end.loans_paid_out), amount(start.loans_paid_out)],
            ["Less: principal repaid", amount(-end.principal_repaid), amount(-start.principal_repaid)],
        ], total=["Principal outstanding", amount(end.loans_outstanding), amount(start.loans_outstanding)], width=w)
        _caption(pdf, [("Cumulative to each date", "loans paid out, principal repaid"),
                       ("As at each date", "principal outstanding")])

    def schedule_c(w):
        _small(pdf, f"C. Cash and Bank Reconciliation ({_day(start.as_at)} - {_day(cur)})", color=INK, size=9)
        _table(pdf, (w * 0.72, w * 0.28), ("LEFT", "RIGHT"), None, [
            [f"Opening cash / bank balance as at {_day(prev)}", amount(start.cash)],
            ["Add: capital received from members", amount(end.capital_received - start.capital_received)],
            ["Add: income received (Schedule A)", amount(end.income_received - start.income_received)],
            ["Less: expenses paid (Schedule D)", amount(-(end.expenses_paid - start.expenses_paid))],
            ["Less: loans paid out", amount(-(end.loans_paid_out - start.loans_paid_out))],
            ["Add: principal repaid", amount(end.principal_repaid - start.principal_repaid)],
        ], total=[f"Closing cash / bank balance as at {_day(cur)}", amount(end.cash)], width=w)
        _caption(pdf, [(f"During the period ({period})", "the movements between the opening and closing balances")])

    def schedule_d(w):
        _small(pdf, f"D. Expenses by category ({period})", color=INK, size=9)
        by_cat = statement.expenses_by_category
        rows = [[EXPENSE_CATEGORY_LABELS.get(k, k), amount(v)] for k, v in by_cat.items()] or [["No expenses recorded", "-"]]
        _table(pdf, (w * 0.72, w * 0.28), ("LEFT", "RIGHT"), None, rows,
               total=["Expenses paid during the period", amount(sum(by_cat.values()))], width=w)
        pending = sum(e.amount for e in statement.expenses_pending)
        _caption(pdf, [(f"During the period ({period})", "expenses approved by the President, by the day they were "
                        "paid; voided and rejected entries excluded"
                        + (f"; Rs. {amount(pending)} awaiting approval is not included" if pending else ""))])

    if landscape:
        def left(w):
            schedule_a(w)
            pdf.ln(5)
            schedule_d(w)

        def right(w):
            schedule_b(w)
            pdf.ln(5)
            schedule_c(w)
        _side_by_side(pdf, left, right)
    else:
        for i, block in enumerate((schedule_a, schedule_b, schedule_c, schedule_d)):
            if i:
                pdf.ln(4)
                _keep(pdf, 45)
            block(pdf.epw)


def _summary_table(pdf: FPDF, m: MonthStatement):
    landscape = pdf.w > pdf.h
    widths = (10, 62, 39, 39, 39, 39, 39) if landscape else (8, 44, 26, 26, 26, 25, 25)
    rows = [
        [str(i), r.member_name, money(r.capital_month), amount(r.capital_total), money(r.loans_issued),
         money(r.capital_due), money(r.capital_advance)]
        for i, r in enumerate(m.summary, start=1)
    ]
    t = m.summary_total
    _table(
        pdf, widths, ("CENTER", "LEFT", "RIGHT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"),
        ("S.N.", "Member", "Capital deposited during period", "Cumulative capital deposited",
         "Cumulative loans issued", "Outstanding capital contribution", "Capital paid in advance"),
        rows,
        total=["", "Total", amount(t.capital_month), amount(t.capital_total), amount(t.loans_issued),
               amount(t.capital_due), amount(t.capital_advance)],
        width=sum(widths),
    )
    span, last = _section_span(m)
    _caption(pdf, [(f"During the period ({span})", "capital deposited"),
                   (f"Cumulative to {last}", "capital deposited, loans issued"),
                   (f"As at {last}", "outstanding capital contribution, capital paid in advance")])


def _accrual_tables(pdf: FPDF, m: MonthStatement):
    landscape = pdf.w > pdf.h
    # Member-level summary
    widths = (10, 72, 22, 41, 41, 41, 40) if landscape else (8, 50, 14, 30, 30, 30, 26)
    loans_of = {}
    for ln in m.loans:
        loans_of[ln.member_id] = loans_of.get(ln.member_id, 0) + 1
    rows = [
        [str(i), r.member_name, str(loans_of.get(r.member_id, 0) or "-"), money(r.principal_outstanding),
         money(r.interest_accrual), money(r.service_charge), money(r.deposit_fine)]
        for i, r in enumerate(m.accruals, start=1)
    ]
    t: AccrualRow = m.accrual_total
    _table(
        pdf, widths, ("CENTER", "LEFT", "CENTER", "RIGHT", "RIGHT", "RIGHT", "RIGHT"),
        ("S.N.", "Member", "Loans", "Principal outstanding", "Interest accrual (earned)", "Renewal / service charge",
         "Fine in deposit"),
        rows,
        total=["", "Total", str(len(m.loans) or "-"), amount(t.principal_outstanding), amount(t.interest_accrual),
               amount(t.service_charge), amount(t.deposit_fine)],
        width=sum(widths),
    )
    span, last = _section_span(m)
    _caption(pdf, [(f"As at {last}", "loans, principal outstanding"),
                   (f"During the period ({span})", "interest accrual (earned, not necessarily received), renewal / "
                    "service charge, fine in deposit")])
    if not m.loans:
        return
    # Loan-level schedule
    pdf.ln(3)
    _keep(pdf, 22)
    _small(pdf, "Loan schedule", color=INK, size=9)
    widths = (28, 56, 33, 35, 18, 30, 33, 34) if landscape else (21, 37, 23, 24, 12, 20, 21, 22)
    rows = []
    for ln in m.loans:
        term = f"{ln.month} of {ln.term}" + (" *" if ln.past_maturity else "")
        rows.append([ln.reference, ln.member_name, amount(ln.principal), amount(ln.principal_outstanding),
                     f"{Decimal(ln.interest_rate).normalize():f}%", term, money(ln.interest_accrual), money(ln.service_charge)])
    _table(
        pdf, widths, ("LEFT", "LEFT", "RIGHT", "RIGHT", "RIGHT", "CENTER", "RIGHT", "RIGHT"),
        ("Loan ref.", "Member", "Principal", "Outstanding", "Rate p.a.", "Month of term", "Interest accrual (earned)",
         "Service charge"),
        rows,
        total=["", "Total", amount(sum(x.principal for x in m.loans)), amount(sum(x.principal_outstanding for x in m.loans)),
               "", "", amount(sum(x.interest_accrual for x in m.loans)), amount(sum(x.service_charge for x in m.loans))],
        width=sum(widths),
    )
    _caption(pdf, [("Principal", "amount originally lent"), (f"As at {last}", "outstanding, month of term"),
                   (f"During the period ({span})", "interest accrual, service charge")])
    if any(ln.past_maturity for ln in m.loans):
        pdf.ln(0.5)
        _small(pdf, "* past its maturity date", color=RED, size=7.5)


# (label, key, basis): "period" = activity during the period, "cumulative" =
# from the start of the records to the end of the period, "balance" = as at its end
PERIOD_ROWS = {
    FINANCIAL_STATEMENT: (
        ("Capital deposited", "capital_deposited", "period"),
        ("Capital deposited", "capital_total", "cumulative"),
        ("Loans issued", "loans_issued", "cumulative"),
        ("Outstanding capital contribution", "capital_due", "balance"),
        ("Capital paid in advance", "capital_advance", "balance"),
    ),
    ACCRUAL_REPORT: (
        ("Interest accrued (earned, not necessarily received)", "interest_accrual", "period"),
        ("Loan renewal / service charges", "service_charge", "period"),
        ("Fines paid with deposits", "deposit_fine", "period"),
        ("Principal outstanding", "principal_outstanding", "balance"),
    ),
}


def _write_monthly(pdf: FPDF, statement: MonthlyStatement, kind: str, number: str = "", outline: bool = False,
                   heading: bool = True):
    if heading:
        _section(pdf, f"{number}{TITLES[kind]}", f"{SUBTITLES[kind]}. Period: {period_text(statement)}.", outline=outline)
    else:
        _small(pdf, f"{SUBTITLES[kind]}.")
        pdf.ln(1)
    for i, m in enumerate(statement.months):
        # Keep a month's heading with its table (rows are ~6.6 mm; captions ~8 mm)
        rows = len(m.summary) + 2 + (len(m.loans) + 4 if kind == ACCRUAL_REPORT else 0)
        _keep(pdf, 28 + min(rows, 14) * 6.6)
        if i:
            pdf.ln(3)
        _subsection(pdf, section_title(m), bs_span(m))
        if m.to_date:
            _small(pdf, "This section runs to the time the report was generated.", color=RED, size=7.5)
        pdf.ln(1)
        if kind == FINANCIAL_STATEMENT:
            _summary_table(pdf, m)
        else:
            _accrual_tables(pdf, m)

    totals = statement.period_totals
    pdf.ln(5)
    _keep(pdf, 45)
    _subsection(pdf, f"Period summary: {period_text(statement)}")
    pdf.ln(1)
    end_day = _day(statement.months[-1].end - timedelta(seconds=1))
    basis_text = {"period": "During the period", "cumulative": f"Cumulative to {end_day}", "balance": f"As at {end_day}"}
    _table(pdf, (110, 50, 45), ("LEFT", "LEFT", "RIGHT"), ("", "Basis", "Amount"),
           [[label, basis_text[basis], f"Rs. {amount(totals[key])}"] for label, key, basis in PERIOD_ROWS[kind]],
           width=205)


def _write_expenses(pdf: FPDF, statement: MonthlyStatement, number: str = "", outline: bool = False):
    """Every expense paid during the period."""
    _section(pdf, f"{number}Expenses",
             f"Expenses recorded by the Treasurer and approved by the President, paid during {period_text(statement)}.",
             outline=outline)
    landscape = pdf.w > pdf.h
    widths = (24, 36, 90, 48, 48, 21) if landscape else (18, 25, 52, 29, 29, 27)
    rows = [
        [_day_d(e.spent_on), EXPENSE_CATEGORY_LABELS.get(e.category, e.category), e.description or "-",
         e.recorded_by_name, e.approved_by_name or "-", amount(e.amount)]
        for e in statement.expenses
    ] or [["", "No approved expenses in this period.", "", "", "", ""]]
    _table(pdf, widths, ("LEFT", "LEFT", "LEFT", "LEFT", "LEFT", "RIGHT"),
           ("Date", "Category", "Description", "Recorded by", "Approved by", "Amount"), rows,
           total=["", "", "Total", "", "", amount(sum(e.amount for e in statement.expenses))], width=sum(widths))
    _caption(pdf, [(f"During the period ({period_text(statement)})", "each approved expense on the day it was paid; "
                    "voided and rejected entries are not shown")])
    if statement.expenses_pending:
        pdf.ln(4)
        _keep(pdf, 30)
        _small(pdf, "Awaiting the President's approval (not counted in this report)", color=RED, size=9)
        w5 = (24, 36, 112, 73, 21) if landscape else (18, 25, 66, 43, 28)
        _table(pdf, w5, ("LEFT", "LEFT", "LEFT", "LEFT", "RIGHT"),
               ("Date", "Category", "Description", "Recorded by", "Amount"),
               [[_day_d(e.spent_on), EXPENSE_CATEGORY_LABELS.get(e.category, e.category), e.description or "-",
                 e.recorded_by_name, amount(e.amount)] for e in statement.expenses_pending],
               total=["", "", "Total awaiting approval", "", amount(sum(e.amount for e in statement.expenses_pending))],
               width=sum(w5))
        _caption(pdf, [("Not counted", "these become part of the figures once the President approves them")])


def _day_d(d) -> str:
    return f"{d.day} {d:%b %Y}"


# ---------------------------------------------------------------------------
# Approval and notes
# ---------------------------------------------------------------------------
def _approval_and_notes(pdf: FPDF, kinds: Iterable[str], reference: str, prepared_by: str, generated_at: datetime,
                        number: str = "", outline: bool = False,
                        checked_by: str = "Treasurer", approved_by: str = "President"):
    basis, limitations = [], []
    for k in kinds:
        for note in NOTES[k][0]:
            if note not in basis:
                basis.append(note)
        for note in NOTES[k][1]:
            if note not in limitations:
                limitations.append(note)
    limitations += [n for n in COMMON_LIMITATIONS if n not in limitations]

    # Approval boxes need ~55 mm; the notes may run on
    if pdf.get_y() > pdf.t_margin + 1:
        pdf.ln(6)
    _keep(pdf, 62)
    _section(pdf, f"{number}Approval and notes", outline=outline)
    gap = 6
    w = (pdf.epw - 2 * gap) / 3
    y = pdf.get_y()
    for i, (role, name) in enumerate((("Prepared by", prepared_by), ("Checked by", checked_by),
                                     ("Approved by", approved_by))):
        x = pdf.l_margin + i * (w + gap)
        pdf.set_draw_color(*RULE)
        pdf.set_fill_color(*ZEBRA)
        pdf.rect(x, y, w, 38, style="DF", round_corners=True, corner_radius=1.5)
        pdf.set_xy(x + 4, y + 3)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*BLUE)
        pdf.cell(w - 8, 4, role.upper(), new_x="LEFT", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*INK)
        pdf.cell(w - 8, 5, _latin1(name), new_x="LEFT", new_y="NEXT")
        pdf.set_draw_color(*MUTED)
        for label, ly in (("Signature", y + 24), ("Date", y + 34)):
            pdf.line(x + 20, ly, x + w - 5, ly)
            pdf.set_xy(x + 4, ly - 4)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(16, 4, label)
    pdf.set_text_color(*INK)
    pdf.set_xy(pdf.l_margin, y + 44)

    def numbered(heading: str, items: list[str], start: int) -> int:
        _keep(pdf, 16)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5.5, _latin1(heading), new_x="LMARGIN", new_y="NEXT")
        for i, text in enumerate(items, start=start):
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*MID)
            pdf.cell(7, 4.1, f"{i}.")
            pdf.multi_cell(0, 4.1, _latin1(text), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*INK)
        pdf.ln(1.5)
        return start + len(items)

    pdf.ln(2)
    n = numbered("Accounting basis and assumptions", basis, 1)
    n = numbered("Data limitations and exclusions", limitations, n)
    numbered("Document verification", [
        f"Reference {reference}, generated by the Yugantar system on {format_local(generated_at)} for {prepared_by}.",
        "The SHA-256 checksum of this file is recorded in the Report Archive under the same reference; a copy whose "
        "checksum differs has been changed. A signed paper copy is the approved record.",
    ], n)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
def _title_block(pdf: FPDF, kind: str, statement: MonthlyStatement, prepared_by: str, generated_at: datetime):
    """First page of a single report: title, period, preparer."""
    _title(pdf, TITLES[kind])
    if kind == FINANCIAL_POSITION:
        cur = statement.position_end.as_at - timedelta(seconds=1)
        line, bs = f"As at {_long_day(cur)}", f"{_bs(cur)} सम्मको"
    else:
        line = f"Reporting period: {period_text(statement)}"
        bs = f"{_bs(statement.months[0].start)} - {_bs(statement.months[-1].end - timedelta(seconds=1))}"
    pdf.set_font("Helvetica", "", 10.5)
    pdf.cell(0, 6, _latin1(line), new_x="LMARGIN", new_y="NEXT")
    _devanagari(pdf, bs, 8.5)
    _small(pdf, f"Prepared by {prepared_by} on {format_local(generated_at)}  |  Amounts in NPR  |  Dates in Nepal Time",
           size=8)
    pdf.ln(4)


def build_single_pdf(statement: MonthlyStatement, kind: str, reference: str, prepared_by: str,
                     generated_at: datetime, checked_by: str = "Treasurer", approved_by: str = "President") -> bytes:
    pdf = _new_doc(kind, reference, generated_at, "P" if kind == FINANCIAL_POSITION else "L")
    pdf.set_title(_latin1(f"{TITLES[kind]}, {period_text(statement)} - {reference}"))
    pdf.add_page()
    _title_block(pdf, kind, statement, prepared_by, generated_at)
    if kind == FINANCIAL_POSITION:
        _write_position(pdf, statement, heading=False)
    else:
        _write_monthly(pdf, statement, kind, heading=False)
    _approval_and_notes(pdf, (kind,), reference, prepared_by, generated_at,
                        checked_by=checked_by, approved_by=approved_by)
    pdf.alias_nb_pages()
    return bytes(pdf.output())


def _kpi(pdf: FPDF, x: float, y: float, w: float, h: float, label: str, value: str, note: str, accent=BLUE):
    pdf.set_draw_color(*RULE)
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(x, y, w, h, style="DF", round_corners=True, corner_radius=2)
    pdf.set_fill_color(*accent)
    pdf.rect(x, y + 3, 1.2, h - 6, style="F")
    pdf.set_xy(x + 5, y + 4)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(*MUTED)
    pdf.cell(w - 8, 4, label.upper(), new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 15 if h > 22 else 12)
    pdf.set_text_color(*INK)
    pdf.cell(w - 8, 8 if h > 22 else 6.5, _latin1(value), new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*MUTED)
    pdf.cell(w - 8, 4, _latin1(note))
    pdf.set_text_color(*INK)


def _cover(pdf: _ReportDoc, statement: MonthlyStatement, reference: str, prepared_by: str, generated_at: datetime):
    """Executive summary: identity, title, key figures, contents."""
    pos = statement.position_end
    totals = statement.period_totals
    cur = pos.as_at - timedelta(seconds=1)
    top = 14
    if LOGO_PATH.is_file():
        pdf.image(str(LOGO_PATH), x=pdf.l_margin, y=top, h=20)
    pdf.set_xy(pdf.l_margin + 23, top + 3)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*BLUE)
    pdf.cell(80, 9, "YUGANTAR", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(80, 5, "COOPERATIVE")
    # Reference block
    rx = pdf.w - pdf.r_margin - 80
    pdf.set_xy(rx, top + 1)
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(80, 4, "REPORT REFERENCE", align="R", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(*INK)
    pdf.cell(80, 8, _latin1(reference), align="R", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MID)
    pdf.cell(80, 5, _long_day(generated_at), align="R")
    _tricolour(pdf, top + 25, 1)

    # Title
    pdf.set_xy(pdf.l_margin, top + 33)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*INK)
    pdf.cell(0, 11, "Complete Financial Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MID)
    pdf.cell(0, 6, _latin1(f"Reporting period: {period_text(statement)}"), new_x="LMARGIN", new_y="NEXT")
    _devanagari(pdf, f"{_bs(statement.months[0].start)} - {_bs(cur)}", 9)

    # Key figures: 4 large, 4 small
    y = pdf.get_y() + 5
    gap = 5
    w = (pdf.epw - 3 * gap) / 4
    as_at = f"as at {_day(cur)}"
    big = (
        ("Total assets", pos.total_assets, as_at, BLUE),
        ("Principal outstanding", pos.loans_outstanding, "loans to members, " + as_at, BLUE),
        ("Capital required", pos.share_capital, "share capital, " + as_at, GREEN),
        ("Retained earnings", pos.retained_earnings, "income received less expenses, " + as_at, GREEN),
    )
    for i, (label, value, note, accent) in enumerate(big):
        _kpi(pdf, pdf.l_margin + i * (w + gap), y, w, 25, label, f"Rs. {amount(value)}", note, accent)
    y += 25 + gap
    small = (
        ("Cash / bank balance", pos.cash, as_at, RED if pos.cash < 0 else BLUE),
        ("Capital deposited", totals["capital_deposited"], "during the period", BLUE),
        ("Interest accrued", totals["interest_accrual"], "earned, not necessarily received", BLUE),
        ("Expenses paid", totals["expenses"], "during the period", RED if totals["expenses"] else BLUE),
        ("Outstanding capital", pos.deposit_receivables, "contributions due, " + as_at, RED if pos.deposit_receivables else BLUE),
    )
    ws = (pdf.epw - 4 * gap) / 5
    for i, (label, value, note, accent) in enumerate(small):
        _kpi(pdf, pdf.l_margin + i * (ws + gap), y, ws, 20, label, f"Rs. {amount(value)}", note, accent)
    pdf.set_xy(pdf.l_margin, y + 20 + 7)

    # Prepared line at the foot of the cover (below the page-break margin)
    pdf.set_auto_page_break(False)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    foot_y = pdf.h - 16
    pdf.set_draw_color(*RULE)
    pdf.line(pdf.l_margin, foot_y - 2, pdf.w - pdf.r_margin, foot_y - 2)
    pdf.set_xy(pdf.l_margin, foot_y)
    pdf.cell(0, 4, _latin1(f"Prepared by {prepared_by}  |  {format_local(generated_at)}  |  Amounts in NPR  |  Dates in Nepal Time"))
    pdf.set_auto_page_break(True, margin=17)
    pdf.set_xy(pdf.l_margin, y + 27)
    pdf.set_text_color(*INK)


def _render_contents(pdf: FPDF, outline):
    """The cover's contents list (rendered at the end, when page numbers are known)."""
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(0, 6, "Report contents", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    width = min(pdf.epw, 170)
    for section in outline:
        if section.level:
            continue
        pdf.set_font("Helvetica", "", 9.5)
        name = section.name
        page = str(section.page_number)
        pdf.cell(width - 12, 6, name, link=pdf.add_link(page=section.page_number))
        pdf.cell(12, 6, page, align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*RULE)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + width, pdf.get_y())


def build_complete_pdf(statement: MonthlyStatement, reference: str, prepared_by: str, generated_at: datetime,
                       checked_by: str = "Treasurer", approved_by: str = "President") -> bytes:
    """Executive summary, then the three reports, then one approval."""
    pdf = _new_doc(COMPLETE_REPORT, reference, generated_at, "L")
    pdf.cover = True
    pdf.set_title(_latin1(f"{TITLES[COMPLETE_REPORT]}, {period_text(statement)} - {reference}"))
    pdf.add_page()
    _cover(pdf, statement, reference, prepared_by, generated_at)
    # Contents go on the cover; the placeholder ends the page
    pdf.insert_toc_placeholder(_render_contents, pages=1, reset_page_indices=False)

    _write_position(pdf, statement, "1. ", outline=True)
    pdf.add_page()
    _write_monthly(pdf, statement, FINANCIAL_STATEMENT, "2. ", outline=True)
    pdf.add_page()
    _write_monthly(pdf, statement, ACCRUAL_REPORT, "3. ", outline=True)
    pdf.add_page()
    _write_expenses(pdf, statement, "4. ", outline=True)
    pdf.add_page()  # approval and all notes together on their own page
    _approval_and_notes(pdf, (FINANCIAL_POSITION, FINANCIAL_STATEMENT, ACCRUAL_REPORT), reference, prepared_by,
                        generated_at, "5. ", outline=True, checked_by=checked_by, approved_by=approved_by)
    pdf.alias_nb_pages()
    return bytes(pdf.output())


def build_report_pdf(
    statement: MonthlyStatement, kind: str, reference: str, prepared_by: str, generated_at: datetime,
    checked_by: str = "Treasurer", approved_by: str = "President"
) -> bytes:
    if kind == COMPLETE_REPORT:
        return build_complete_pdf(statement, reference, prepared_by, generated_at, checked_by, approved_by)
    return build_single_pdf(statement, kind, reference, prepared_by, generated_at, checked_by, approved_by)


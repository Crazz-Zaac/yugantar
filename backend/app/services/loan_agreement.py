"""
Loan agreement record (PDF), generated once when a loan is approved.

The PDF records who borrowed what, on which terms, who stood guarantor (with
their signature name and time), and who verified funds and approved it. It is
stored permanently (core/document_storage.py) with its SHA-256, and served to
the applicant, the guarantor and the office bearers.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from dateutil.relativedelta import relativedelta
from fpdf import FPDF
from sqlmodel import Session, select

from app.core.document_storage import document_storage
from app.models.loan_model import Loan
from app.models.policy.loan_policy import LoanPolicy
from app.models.user_model import User
from app.services.duties import name_with_role
from app.utils.local_time import format_local


def _txt(value) -> str:
    """Core PDF fonts are Latin-1 only; replace anything else."""
    s = "" if value is None else str(value)
    s = s.replace("–", "-").replace("—", "-").replace("’", "'").replace("‘", "'")
    return s.encode("latin-1", "replace").decode("latin-1")


def _rs(paisa_or_rupees: Decimal) -> str:
    n = Decimal(paisa_or_rupees)
    whole = int(n)
    s = str(whole)
    # Nepali/Indian grouping: 1,00,000
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    grouped = ",".join(groups + [tail]) if groups else tail
    frac = n - whole
    return f"Rs. {grouped}" + (f".{int(round(frac * 100)):02d}" if frac else "")


def _name(user: Optional[User]) -> str:
    return f"{user.first_name} {user.last_name}".strip() if user else "-"


def _term_months(loan: Loan) -> int:
    delta = relativedelta(loan.maturity_date, loan.start_date)
    return max(1, delta.years * 12 + delta.months + (1 if delta.days >= 15 else 0))


class _Doc(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 15)
        self.cell(0, 8, "Yugantar Cooperative", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 10)
        self.set_text_color(90, 90, 90)
        self.cell(0, 6, "Loan agreement record", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.set_draw_color(30, 160, 120)
        self.set_line_width(0.6)
        self.line(self.l_margin, self.get_y() + 2, self.w - self.r_margin, self.get_y() + 2)
        self.ln(6)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 5, _txt(f"Page {self.page_no()}  ·  Generated automatically by Yugantar"), align="C")

    def section(self, title: str):
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_fill_color(236, 247, 242)
        self.cell(0, 7, _txt(title), fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def row(self, label: str, value: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(90, 90, 90)
        self.cell(55, 6, _txt(label))
        self.set_text_color(0, 0, 0)
        self.multi_cell(0, 6, _txt(value), new_x="LMARGIN", new_y="NEXT")


def build_agreement_pdf(session: Session, loan: Loan) -> bytes:
    applicant = session.get(User, loan.user_id)
    guarantor = session.get(User, loan.guarantor_user_id) if loan.guarantor_user_id else None
    policy = session.get(LoanPolicy, loan.policy_id) if loan.policy_id else None
    by_email = lambda email: (name_with_role(session.exec(select(User).where(User.email == email)).first()) or "-") if email else "-"

    months = _term_months(loan)
    principal = Decimal(loan.principal_paisa) / 100
    monthly_interest = (principal * Decimal(loan.interest_rate) / 100 / 12)
    total_interest = (monthly_interest * months).quantize(Decimal("0.01"))
    reference = str(loan.id).split("-")[0].upper()

    pdf = _Doc(format="A4")
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_page()

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, _txt(f"Reference: LN-{reference}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, _txt(f"Approved: {format_local(loan.approved_at) if loan.approved_at else '-'}"), new_x="LMARGIN", new_y="NEXT")

    pdf.section("Borrower")
    pdf.row("Name", _name(applicant))
    pdf.row("Email", applicant.email if applicant else "-")
    pdf.row("Phone", applicant.phone if applicant else "-")

    pdf.section("Loan terms")
    pdf.row("Amount", _rs(principal))
    pdf.row("Purpose", loan.purpose or "-")
    pdf.row("Interest rate", f"{Decimal(loan.interest_rate).normalize()}% per year (simple interest)")
    pdf.row("Term", f"{months} months: {format_local(loan.start_date)[:11]} to {format_local(loan.maturity_date)[:11]}")
    pdf.row("Monthly interest", _rs(monthly_interest.quantize(Decimal("0.01"))))
    pdf.row("Total interest", _rs(total_interest))
    pdf.row("Total to repay", _rs(principal + total_interest))
    if policy:
        pdf.row("Grace period", f"{policy.grace_period_days or 0} days before late penalties")
        pdf.row("Renewals", f"Up to {loan.max_renewals or 0}")
    if loan.collateral_details:
        pdf.row("Collateral notes", loan.collateral_details)

    pdf.section("Guarantor")
    if guarantor:
        pdf.row("Member", _name(guarantor))
        pdf.row("Signed as", loan.guarantor_signed_name or "-")
        pdf.row("Signed on", format_local(loan.guarantor_signed_at) if loan.guarantor_signed_at else "-")
        pdf.row("Undertaking", "The guarantor agreed to stand surety for this loan in the Yugantar app.")
    else:
        pdf.row("Guarantor", "None required under this policy")

    pdf.section("Approval")
    pdf.row("Applied", format_local(loan.created_at) if loan.created_at else "-")
    pdf.row("Funds verified by", f"{by_email(loan.fund_verified_by)}  ({format_local(loan.fund_verified_at) if loan.fund_verified_at else '-'})")
    pdf.row("Approved by", f"{by_email(loan.approved_by)}  ({format_local(loan.approved_at) if loan.approved_at else '-'})")

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 8.5)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0, 4.5,
        _txt(
            "This record was generated by the Yugantar system when the loan was approved. Signatures above were "
            "given electronically by signing in to the app. Amounts are estimates under the policy's simple-interest "
            "terms; the cooperative's ledger is authoritative. A SHA-256 checksum of this file is stored in the system."
        ),
    )
    return bytes(pdf.output())


def generate_and_store(session: Session, loan: Loan) -> Loan:
    """Create the agreement PDF once (no-op if it already exists)."""
    if loan.agreement_file_key:
        return loan
    data = build_agreement_pdf(session, loan)
    key, digest = document_storage.save(data, prefix="loan-agreements")
    loan.agreement_file_key = key
    loan.agreement_sha256 = digest
    loan.agreement_generated_at = datetime.now(timezone.utc)
    session.add(loan)
    session.commit()
    session.refresh(loan)
    return loan

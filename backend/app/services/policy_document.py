"""
What a policy says, in plain language, and its adoption record (PDF).

`policy_terms()` and `policy_statement()` are the single source of the wording:
the signing dialog shows them to members before they sign, and the PDF prints
the same text.

The adoption record is a letter on Yugantar letterhead with a unique reference
number (e.g. YUG/DP/2026/0003). It states the policy, lists the members who
approved it (with role, decision and date) and ends with the Treasurer's
signature block. It is generated once, when the policy is adopted (or on the
first download of a policy adopted earlier), stored permanently with its
SHA-256 (core/document_storage.py) and can be downloaded by any member.
"""

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional

import nepali_datetime
from fpdf import FPDF
from fpdf.fonts import FontFace
from sqlmodel import Session, select

from app.core.document_storage import document_storage
from app.models.policy.base_policy import PolicyStatus
from app.models.policy.deposit_policy import DepositScheduleType
from app.models.policy.policy_record import PolicyRecord
from app.models.policy.policy_signature import PolicySignature, SignatureStatus
from app.models.user_model import CooperativeRole, User
from app.services.duties import coop_roles, is_active_member, is_system_admin
from app.utils.local_time import format_local, to_local

log = logging.getLogger(__name__)

ASSETS = Path(__file__).resolve().parent.parent / "assets"
LOGO_PATH = ASSETS / "yugantar_logo.png"
# Noto Sans Devanagari for the Nepali text, with Noto Sans as the fallback for
# Latin letters inside it (e.g. "EMI"). Both SIL Open Font License.
DEVANAGARI_FONT = ASSETS / "fonts" / "NotoSansDevanagari-Regular.ttf"
LATIN_FALLBACK_FONT = ASSETS / "fonts" / "NotoSans-Regular.ttf"
_NE_MONTHS_AD = ["जनवरी", "फेब्रुअरी", "मार्च", "अप्रिल", "मे", "जुन", "जुलाई", "अगस्ट", "सेप्टेम्बर", "अक्टोबर", "नोभेम्बर", "डिसेम्बर"]
ORG_NAME = "Yugantar Cooperative"
# Logo colours
BLUE = (42, 79, 216)
RED = (224, 58, 16)
GREEN = (109, 173, 45)
DARK_GREEN = (46, 125, 50)
INK = (33, 37, 41)
MUTED = (110, 116, 124)

# Statuses a policy can have once it was adopted
ADOPTED_STATUSES = {PolicyStatus.ACTIVE, PolicyStatus.EXPIRED}


# ---------------------------------------------------------------------------
# Plain-language wording
# ---------------------------------------------------------------------------
def rs(amount) -> str:
    """Rs. 1,00,000 or Rs. 250.50 (Nepali/Indian digit grouping)."""
    n = Decimal(str(amount)).quantize(Decimal("0.01"))
    whole = int(n)
    head, tail = str(whole)[:-3], str(whole)[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    text = ",".join(groups + [tail])
    frac = n - whole
    return f"Rs. {text}" + (f".{int(frac * 100):02d}" if frac else "")


def _num(value) -> str:
    """5 / 5.5 / 12.25, without trailing zeros."""
    d = Decimal(str(value)).normalize()
    return format(d, "f")


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _day(dt: Optional[datetime]) -> str:
    return to_local(dt).strftime("%d %b %Y").lstrip("0") if dt else "-"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def deposit_amount(policy) -> Decimal:
    return Decimal(policy.amount_paisa) / 100


def late_fine_amount(policy) -> Decimal:
    """The fine is a one-off percentage of the deposit amount (see calculate_late_fine)."""
    return (deposit_amount(policy) * Decimal(str(policy.late_deposit_fine)) / 100).quantize(Decimal("0.01"))


def policy_title(policy_type: str, policy) -> str:
    if policy_type == "deposit":
        when = "monthly" if policy.schedule_type == DepositScheduleType.MONTHLY_FIXED_DAY else "occasional"
        return f"Deposit Policy ({rs(deposit_amount(policy))} {when})"
    return f"Loan Policy ({rs(policy.min_loan_amount)} to {rs(policy.max_loan_amount)} at {_num(policy.interest_rate)}%)"


def _schedule_text(policy) -> str:
    if policy.schedule_type == DepositScheduleType.MONTHLY_FIXED_DAY:
        if policy.due_day_of_month:
            return f"by the {_ordinal(policy.due_day_of_month)} of every month"
        return "every month"
    parts = []
    if policy.allowed_months:
        parts.append(f"within {_plural(policy.allowed_months, 'month')}")
    if policy.max_occurrences:
        parts.append(f"up to {_plural(policy.max_occurrences, 'time')}")
    return " ".join(parts) if parts else "when called for"


def _effective_text(policy) -> str:
    text = f"effective from {_day(policy.effective_from)}"
    if policy.effective_to:
        text += f" until {_day(policy.effective_to)}"
    return text


def policy_statement(policy_type: str, policy) -> str:
    """One paragraph saying what the policy requires."""
    if policy_type == "deposit":
        fine_pct = _num(policy.late_deposit_fine)
        fine = (
            f"A deposit made after the due date carries a late fine of {fine_pct}% of the deposit "
            f"({rs(late_fine_amount(policy))})."
            if policy.late_deposit_fine
            else "There is no fine for late deposits."
        )
        return (
            f"Every member shall deposit {rs(deposit_amount(policy))} {_schedule_text(policy)}. {fine} "
            f"This policy is {_effective_text(policy)}."
        )
    guarantor = (
        "Every loan needs a guarantor: another member who signs to stand surety for it."
        if policy.requires_collateral
        else "A guarantor is optional."
    )
    renewals = (
        f"A loan may be renewed up to {_plural(policy.max_renewals, 'time')}."
        if policy.max_renewals
        else "Loans cannot be renewed."
    )
    grace = (
        f"There is a grace period of {_plural(policy.grace_period_days, 'day')} before late penalties apply."
        if policy.grace_period_days
        else "Late penalties apply from the due date."
    )
    emi = " Members may also repay in equal monthly instalments (EMI)." if policy.emi_applicable else ""
    return (
        f"Members may borrow between {rs(policy.min_loan_amount)} and {rs(policy.max_loan_amount)} at "
        f"{_num(policy.interest_rate)}% interest per year, charged as simple interest on the amount borrowed. "
        f"{grace} {renewals} {guarantor}{emi} This policy is {_effective_text(policy)}."
    )


# ---------------------------------------------------------------------------
# Nepali wording (templates, no translation service). Numbers use Devanagari
# digits; dates are Bikram Sambat with the AD date in brackets. Deposit due
# days are days of the English (AD) month, so the text says "tarikh" (AD),
# not "gate" (BS).
# ---------------------------------------------------------------------------
_NE_DIGITS = str.maketrans("0123456789", "०१२३४५६७८९")


def ne_num(value) -> str:
    """Devanagari digits: 12.5 -> १२.५"""
    text = value if isinstance(value, str) else _num(value)
    return text.translate(_NE_DIGITS)


def ne_rs(amount) -> str:
    return "रु. " + rs(amount).removeprefix("Rs. ").translate(_NE_DIGITS)


def ne_date(dt: Optional[datetime]) -> str:
    """वि.सं. २०८३ कार्तिक २६ (ई.सं. २०२६ नोभेम्बर १२)"""
    if not dt:
        return "-"
    local: date = to_local(dt).date()
    bs = nepali_datetime.date.from_datetime_date(local)
    ad = f"ई.सं. {ne_num(str(local.year))} {_NE_MONTHS_AD[local.month - 1]} {ne_num(str(local.day))}"
    return f"वि.सं. {ne_num(str(bs.year))} {bs.strftime('%N')} {ne_num(str(bs.day))} ({ad})"


def policy_statement_ne(policy_type: str, policy) -> str:
    """The policy in Nepali (same facts as policy_statement)."""
    starts = f"यो नीति {ne_date(policy.effective_from)} देखि"
    effective = f"{starts} {ne_date(policy.effective_to)} सम्म लागू हुनेछ।" if policy.effective_to else f"{starts} लागू हुनेछ।"
    if policy_type == "deposit":
        amount = ne_rs(deposit_amount(policy))
        if policy.schedule_type == DepositScheduleType.MONTHLY_FIXED_DAY:
            when = (
                f"हरेक अंग्रेजी महिनाको {ne_num(str(policy.due_day_of_month))} तारिखभित्र"
                if policy.due_day_of_month
                else "हरेक महिना"
            )
        else:
            parts = []
            if policy.allowed_months:
                parts.append(f"{ne_num(str(policy.allowed_months))} महिनाभित्र")
            if policy.max_occurrences:
                parts.append(f"(बढीमा {ne_num(str(policy.max_occurrences))} पटक)")
            when = " ".join(parts) or "माग भएअनुसार"
        fine = (
            f"तोकिएको मितिपछि जम्मा गरेमा जम्मा रकमको {ne_num(policy.late_deposit_fine)}% "
            f"({ne_rs(late_fine_amount(policy))}) विलम्ब शुल्क लाग्नेछ।"
            if policy.late_deposit_fine
            else "ढिलो जम्मा गरेमा कुनै विलम्ब शुल्क लाग्ने छैन।"
        )
        return f"प्रत्येक सदस्यले {when} {amount} जम्मा गर्नुपर्नेछ। {fine} {effective}"

    grace = (
        f"विलम्ब जरिवाना लाग्नुअघि {ne_num(str(policy.grace_period_days))} दिनको सहुलियत अवधि हुनेछ।"
        if policy.grace_period_days
        else "तोकिएको मितिदेखि नै विलम्ब जरिवाना लाग्नेछ।"
    )
    renewals = (
        f"ऋण बढीमा {ne_num(str(policy.max_renewals))} पटक नवीकरण गर्न सकिनेछ।"
        if policy.max_renewals
        else "ऋण नवीकरण गर्न पाइने छैन।"
    )
    guarantor = (
        "प्रत्येक ऋणका लागि अर्को सदस्य जमानीकर्ता हुनुपर्नेछ, जसले ऋणको जमानी बस्न हस्ताक्षर गर्नुपर्नेछ।"
        if policy.requires_collateral
        else "जमानीकर्ता राख्नु ऐच्छिक हो।"
    )
    emi = " सदस्यहरूले समान मासिक किस्ता (EMI) मा पनि भुक्तानी गर्न सक्नेछन्।" if policy.emi_applicable else ""
    return (
        f"सदस्यहरूले वार्षिक {ne_num(policy.interest_rate)}% साधारण ब्याजदरमा {ne_rs(policy.min_loan_amount)} देखि "
        f"{ne_rs(policy.max_loan_amount)} सम्म ऋण लिन सक्नेछन्; ब्याज लिएको पूरै रकममा गणना गरिनेछ। "
        f"{grace} {renewals} {guarantor}{emi} {effective}"
    )


def _custom(text: Optional[str]) -> Optional[str]:
    return text.strip() if text and text.strip() else None


def statement_en(policy_type: str, policy) -> str:
    """The English wording members sign: the Treasurer's text, else generated."""
    return _custom(getattr(policy, "statement_en", None)) or policy_statement(policy_type, policy)


def statement_ne(policy_type: str, policy) -> str:
    """The Nepali wording members sign: the Treasurer's text, else generated."""
    return _custom(getattr(policy, "statement_ne", None)) or policy_statement_ne(policy_type, policy)


def policy_terms(policy_type: str, policy) -> list[tuple[str, str]]:
    """The policy's terms as (label, value) rows."""
    until = _day(policy.effective_to) if policy.effective_to else "Until replaced or ended"
    if policy_type == "deposit":
        if policy.schedule_type == DepositScheduleType.MONTHLY_FIXED_DAY:
            schedule = (
                f"Monthly, due by the {_ordinal(policy.due_day_of_month)}"
                if policy.due_day_of_month
                else "Monthly"
            )
        else:
            schedule = f"Occasional, {_schedule_text(policy)}"
        fine = (
            f"{_num(policy.late_deposit_fine)}% of the deposit ({rs(late_fine_amount(policy))})"
            if policy.late_deposit_fine
            else "None"
        )
        return [
            ("Deposit amount", rs(deposit_amount(policy))),
            ("Schedule", schedule),
            ("Late fine", fine),
            ("Effective from", _day(policy.effective_from)),
            ("Effective until", until),
        ]
    return [
        ("Loan amount", f"{rs(policy.min_loan_amount)} to {rs(policy.max_loan_amount)}"),
        ("Interest", f"{_num(policy.interest_rate)}% per year, simple interest"),
        ("Grace period", _plural(policy.grace_period_days, "day") if policy.grace_period_days else "None"),
        ("Renewals", f"Up to {policy.max_renewals}" if policy.max_renewals else "Not allowed"),
        ("Guarantor", "Required (another member)" if policy.requires_collateral else "Optional"),
        ("EMI repayment", "Available" if policy.emi_applicable else "Not available"),
        ("Effective from", _day(policy.effective_from)),
        ("Effective until", until),
    ]


def role_text(user: Optional[User]) -> str:
    order = [CooperativeRole.PRESIDENT.value, CooperativeRole.TREASURER.value, CooperativeRole.SECRETARY.value]
    roles = [r.title() for r in order if r in coop_roles(user)]
    return ", ".join(roles) or "Member"


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------
def _latin1(value) -> str:
    """The core PDF fonts are Latin-1 only."""
    s = "" if value is None else str(value)
    for a, b in (("–", "-"), ("—", "-"), ("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'), ("·", "-")):
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


class _Letterhead(FPDF):
    reference = ""
    issued = ""
    preview = False  # signing still open: watermark, no reference number

    def header(self):
        if self.preview:
            # Light diagonal watermark behind the content
            mark = "PREVIEW - NOT ADOPTED"
            self.set_font("Helvetica", "B", 44)
            self.set_text_color(248, 222, 214)
            cx, cy = self.w / 2, self.h / 2 + 10
            with self.rotation(35, x=cx, y=cy):
                self.text(cx - self.get_string_width(mark) / 2, cy + 6, mark)
        top = 12
        if LOGO_PATH.is_file():
            self.image(str(LOGO_PATH), x=self.l_margin, y=top, h=24)
        x = self.l_margin + 26
        self.set_xy(x, top + 2)
        self.set_font("Helvetica", "B", 20)
        self.set_text_color(*BLUE)
        self.cell(0, 9, "YUGANTAR", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*INK)
        self.cell(0, 5, "Cooperative", new_x="LMARGIN", new_y="NEXT")

        # Reference block, right aligned
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*MUTED)
        self.set_xy(self.w - self.r_margin - 70, top + 4)
        self.cell(70, 5, "Ref. No.", align="R", new_x="LEFT", new_y="NEXT")
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*INK)
        self.cell(70, 6, _latin1(self.reference), align="R", new_x="LEFT", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*MUTED)
        self.cell(70, 5, _latin1(f"Date: {self.issued}"), align="R")

        # Three-colour rule from the logo
        y = top + 28
        width = self.w - self.l_margin - self.r_margin
        for i, colour in enumerate((BLUE, RED, GREEN)):
            self.set_fill_color(*colour)
            self.rect(self.l_margin + i * width / 3, y, width / 3, 1.2, style="F")
        self.set_y(y + 7)
        self.set_text_color(*INK)

    def footer(self):
        self.set_y(-16)
        self.set_draw_color(220, 222, 226)
        self.set_line_width(0.3)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(1.5)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 4, _latin1(f"{ORG_NAME}  |  Policy adoption record  |  {self.reference}"), align="L")
        self.set_x(self.l_margin)
        self.cell(0, 4, f"Page {self.page_no()} of {{nb}}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.cell(
            0, 4,
            "Preview generated by the Yugantar system while signing is open. Not an official record."
            if self.preview
            else "Generated by the Yugantar system. A SHA-256 checksum of this file is kept to show it has not been altered.",
            align="L",
        )

    def heading(self, text: str):
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*BLUE)
        self.cell(0, 7, _latin1(text), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*INK)

    def paragraph(self, text: str, size: float = 10.5):
        self.set_font("Helvetica", "", size)
        self.multi_cell(0, 5.6, _latin1(text), new_x="LMARGIN", new_y="NEXT")


def _signature_rows(session: Session, policy_type: str, policy_id) -> list[tuple[PolicySignature, Optional[User]]]:
    rows = session.exec(
        select(PolicySignature).where(
            PolicySignature.policy_type == policy_type, PolicySignature.policy_id == policy_id
        )
    ).all()
    out = []
    for r in rows:
        user = session.get(User, r.user_id)
        if user is not None and is_system_admin(user):
            continue  # system admin accounts are not signers
        out.append((r, user))
    out.sort(key=lambda ru: (ru[0].signed_at is None, ru[0].signed_at or datetime.max, (ru[0].signer_name or "").lower()))
    return out


def _signature_path(row: PolicySignature) -> Optional[Path]:
    return document_storage.path_for(row.signature_file_key) if row.signature_file_key else None


def _treasurer(session: Session, policy) -> Optional[User]:
    """The Treasurer who created the policy, else any active Treasurer."""
    def is_treasurer(u: Optional[User]) -> bool:
        return bool(u) and is_active_member(u) and not is_system_admin(u) and CooperativeRole.TREASURER.value in coop_roles(u)

    creator = session.exec(select(User).where(User.email == policy.created_by)).first() if policy.created_by else None
    if is_treasurer(creator):
        return creator
    return next((u for u in session.exec(select(User)).all() if is_treasurer(u)), None)


def _adoption_sentence(policy, rows) -> str:
    approved = [r for r, u in rows if r.status == SignatureStatus.APPROVED]
    counted = [r for r, u in rows if not (u and u.disabled)]
    if not rows:
        return (
            "This policy was adopted before member signatures were recorded in the Yugantar app, "
            f"and is {_effective_text(policy)}."
        )
    adopted_on = policy.signing_deadline or policy.updated_at
    everyone = len(approved) >= len(counted)
    who = (
        f"All {len(approved)} members listed below" if everyone
        else f"{len(approved)} of the {len(counted)} members listed below"
    )
    starts = policy.effective_from
    if adopted_on and starts and starts <= adopted_on:
        effect = f"and it took effect immediately on adoption ({_day(adopted_on)})"
    else:
        effect = f"and it takes effect from {_day(starts)}"
    return f"{who} signed and approved this policy by {_day(adopted_on)}, {effect}."


def _preview_sentence(policy, rows) -> str:
    counted = [r for r, u in rows if not (u and u.disabled)]
    approved = [r for r in counted if r.status == SignatureStatus.APPROVED]
    deadline = format_local(policy.signing_deadline) if policy.signing_deadline else "the deadline"
    return (
        f"PREVIEW: signing is open until {deadline}. So far {len(approved)} of {len(counted)} members have signed. "
        "This is not the adoption record; the final record, with a reference number, is issued once the policy is adopted."
    )


def build_record_pdf(
    session: Session, policy_type: str, policy, reference: str, issued_at: datetime, preview: bool = False
) -> tuple[bytes, Optional[str]]:
    rows = _signature_rows(session, policy_type, policy.policy_id)
    treasurer = _treasurer(session, policy)
    treasurer_name = f"{treasurer.first_name} {treasurer.last_name}".strip() if treasurer else None

    pdf = _Letterhead(format="A4")
    pdf.add_font("NotoDeva", fname=str(DEVANAGARI_FONT))
    pdf.add_font("NotoLatin", fname=str(LATIN_FALLBACK_FONT))
    pdf.reference = reference
    pdf.issued = _day(issued_at)
    pdf.preview = preview
    pdf.set_margins(20, 15, 20)
    pdf.set_auto_page_break(True, margin=22)
    pdf.set_title(_latin1(f"{policy_title(policy_type, policy)} - {reference}"))
    pdf.set_author(ORG_NAME)
    pdf.add_page()

    # Subject
    pdf.set_font("Helvetica", "B", 13)
    pdf.multi_cell(0, 7, _latin1(f"Subject: Adoption of the {policy_title(policy_type, policy)}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # The policy, in words: Nepali only (shaped Devanagari)
    pdf.set_font("NotoDeva", "", 10.5)
    pdf.set_fallback_fonts(["NotoLatin"])
    pdf.set_text_shaping(True)
    pdf.multi_cell(0, 6.2, statement_ne(policy_type, policy), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_shaping(False)
    pdf.set_fallback_fonts([])
    pdf.ln(2)
    if preview:
        pdf.set_text_color(*RED)
        pdf.paragraph(_preview_sentence(policy, rows), size=10)
        pdf.set_text_color(*INK)
    else:
        pdf.paragraph(_adoption_sentence(policy, rows))

    # Terms
    pdf.heading("Policy terms")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_draw_color(225, 228, 232)
    with pdf.table(
        col_widths=(45, 125),
        first_row_as_headings=False,
        line_height=6.5,
        borders_layout="HORIZONTAL_LINES",
        cell_fill_color=(246, 248, 252),
        cell_fill_mode="COLUMNS",
    ) as table:
        for label, value in policy_terms(policy_type, policy):
            row = table.row()
            row.cell(_latin1(label), style=FontFace(emphasis="BOLD", color=MUTED))
            row.cell(_latin1(value))

    # Members
    if rows:
        pdf.heading("Members' approval")
        pdf.set_font("Helvetica", "", 9)
        with pdf.table(
            col_widths=(8, 44, 25, 27, 32, 34),
            # Taller rows when hand signatures are shown, so they are legible
            line_height=9 if any(_signature_path(r) for r, _ in rows) else 5.5,
            borders_layout="HORIZONTAL_LINES",
            headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=BLUE),
            text_align=("CENTER", "LEFT", "LEFT", "LEFT", "LEFT", "CENTER"),
            v_align="MIDDLE",
        ) as table:
            head = table.row()
            for h in ("No.", "Member", "Role", "Decision", "Signed on (NPT)", "Signature"):
                head.cell(h)
            for i, (r, user) in enumerate(rows, start=1):
                name = r.signer_name or (f"{user.first_name} {user.last_name}".strip() if user else "-")
                decision = {
                    SignatureStatus.APPROVED: "Approved",
                    SignatureStatus.REJECTED: "Rejected",
                }.get(r.status, "Not signed yet" if preview else "Did not sign")
                if r.proxy_request_id and r.status != SignatureStatus.PENDING:
                    decision += " (by proxy)"
                row = table.row()
                row.cell(str(i))
                row.cell(_latin1(name))
                row.cell(_latin1(role_text(user)))
                row.cell(decision, style=FontFace(color=DARK_GREEN if r.status == SignatureStatus.APPROVED else RED))
                row.cell(to_local(r.signed_at).strftime("%d %b %Y, %H:%M").lstrip("0") if r.signed_at else "-")
                image = _signature_path(r)
                if image:
                    row.cell(img=str(image), img_fill_width=False)
                else:
                    row.cell("-" if r.status != SignatureStatus.APPROVED else "Signed in app",
                             style=FontFace(color=MUTED, size_pt=7.5))
        if any(r.proxy_request_id for r, _ in rows):
            pdf.set_font("Helvetica", "I", 8.5)
            pdf.set_text_color(*MUTED)
            pdf.multi_cell(
                0, 4.5,
                "By proxy: signed by an Admin on the member's behalf after consulting them, with the "
                "authorisation of the President, Treasurer and Secretary.",
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_text_color(*INK)
    else:
        # Adopted before signatures were recorded in the app: members sign the printed copy
        members = sorted(
            (u for u in session.exec(select(User)).all()
             if is_active_member(u) and coop_roles(u) and not is_system_admin(u)),
            key=lambda u: (u.first_name.lower(), u.last_name.lower()),
        )
        pdf.heading("Members' signatures")
        pdf.set_font("Helvetica", "I", 8.5)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(
            0, 4.5,
            "No signatures were recorded in the app for this policy. Members confirm it by signing the printed copy below.",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*INK)
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 9.5)
        with pdf.table(
            col_widths=(10, 60, 35, 65),
            line_height=8.5,
            borders_layout="HORIZONTAL_LINES",
            headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=BLUE),
            text_align=("CENTER", "LEFT", "LEFT", "LEFT"),
            v_align="MIDDLE",
        ) as table:
            head = table.row()
            for h in ("No.", "Member", "Role", "Signature and date"):
                head.cell(h)
            for i, user in enumerate(members, start=1):
                row = table.row()
                row.cell(str(i))
                row.cell(_latin1(f"{user.first_name} {user.last_name}".strip()))
                row.cell(_latin1(role_text(user)))
                row.cell("")

    # Closing and signature block (kept together on one page: ~60 mm)
    if pdf.get_y() + 48 > pdf.h - pdf.b_margin:
        pdf.add_page()
    pdf.ln(4)
    pdf.paragraph(
        "This record is issued on behalf of the members of Yugantar and is kept as the official record "
        "of the policy's adoption.",
        size=10,
    )
    pdf.ln(14)
    x = pdf.w - pdf.r_margin - 70
    # The Treasurer's own hand signature on this policy, above the line
    t_row = next((r for r, u in rows if treasurer and u and u.id == treasurer.id and r.status == SignatureStatus.APPROVED), None)
    t_image = _signature_path(t_row) if t_row else None
    if t_image:
        pdf.image(str(t_image), x=x + 2, y=pdf.get_y() - 15, h=14, keep_aspect_ratio=True, w=60)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.3)
    pdf.line(x, pdf.get_y(), x + 70, pdf.get_y())
    pdf.ln(1.5)
    pdf.set_x(x)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.cell(70, 5.5, _latin1(treasurer_name or ""), new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(70, 5.5, "Treasurer, Yugantar", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(70, 5, _latin1(f"Date: {_day(issued_at)}"))
    pdf.set_text_color(*INK)

    return bytes(pdf.output()), treasurer_name


# ---------------------------------------------------------------------------
# Stored record
# ---------------------------------------------------------------------------
def get_record(session: Session, policy_type: str, policy_id) -> Optional[PolicyRecord]:
    return session.exec(
        select(PolicyRecord).where(PolicyRecord.policy_type == policy_type, PolicyRecord.policy_id == policy_id)
    ).first()


def _next_reference(session: Session, policy_type: str, when: datetime) -> str:
    """YUG/DP/2026/0001 (deposit) or YUG/LP/2026/0001 (loan): one sequence per year."""
    year = to_local(when).year
    taken = session.exec(select(PolicyRecord.reference).where(PolicyRecord.reference.like(f"YUG/%/{year}/%"))).all()
    seq = max((int(ref.rsplit("/", 1)[1]) for ref in taken), default=0) + 1
    return f"YUG/{'DP' if policy_type == 'deposit' else 'LP'}/{year}/{seq:04d}"


def ensure_record(session: Session, policy_type: str, policy) -> Optional[PolicyRecord]:
    """The policy's adoption record, created on first use. None if it wasn't adopted."""
    existing = get_record(session, policy_type, policy.policy_id)
    if existing or policy.status not in ADOPTED_STATUSES:
        return existing
    now = datetime.now(timezone.utc)
    reference = _next_reference(session, policy_type, now)
    data, treasurer_name = build_record_pdf(session, policy_type, policy, reference, now)
    key, digest = document_storage.save(data, prefix="policy-records")
    record = PolicyRecord(
        policy_type=policy_type,
        policy_id=policy.policy_id,
        reference=reference,
        file_key=key,
        sha256=digest,
        generated_at=now,
        certified_by_name=treasurer_name,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def build_preview(session: Session, policy_type: str, policy) -> Optional[bytes]:
    """A watermarked preview while signing is open (not stored). None otherwise."""
    if policy.status != PolicyStatus.FINALIZED:
        return None
    data, _ = build_record_pdf(session, policy_type, policy, "PREVIEW", datetime.now(timezone.utc), preview=True)
    return data


def try_create_record(session: Session, policy_type: str, policy) -> None:
    """At adoption: create the record, but never let a PDF problem undo the adoption."""
    try:
        ensure_record(session, policy_type, policy)
    except Exception:  # noqa: BLE001
        session.rollback()
        log.exception("Could not create the adoption record for %s policy %s", policy_type, policy.policy_id)

"""
Approved meeting minutes as an official PDF (A4 portrait, the reports'
letterhead and type scale): meeting details, attendance, the proceedings
item by item (discussion, decision, vote), a resolutions summary, other
business, and the record / approval block.
"""

from datetime import datetime
from typing import Optional

from fpdf.fonts import FontFace

from app.schemas.meeting_minutes_schema import MinutesOut
from app.services.policy_document import GREEN, INK, MUTED, RED, _latin1
from app.services.reports.statement_pdf import (
    MID,
    TABLE_HEAD,
    RULE,
    ZEBRA,
    _bs,
    _caption,
    _devanagari,
    _keep,
    _long_day,
    _new_doc,
    _section,
    _small,
    _table,
    _title,
)
from app.utils.local_time import format_local, to_local

CATEGORY = {
    "policy": "Policy", "bill": "Bill / proposal", "investment": "Investment", "loan": "Loan",
    "budget": "Budget / expense", "election": "Election", "other": "Other",
}


def _result(v) -> str:
    if v.result == "passed":
        return "Passed (unanimous)" if v.unanimous else "Passed by majority"
    return "Not passed"


def _label(pdf, text: str):
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4.5, text.upper(), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)


def _para(pdf, text: str):
    pdf.set_font("Helvetica", "", 9.5)
    pdf.multi_cell(0, 5, _latin1(text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)


def build_minutes_pdf(m: MinutesOut, approved_at: datetime, signature_paths: Optional[dict] = None) -> bytes:
    """`signature_paths`: attendee user id -> PNG path of their hand signature."""
    signature_paths = signature_paths or {}
    pdf = _new_doc("meeting_minutes", m.reference or "", approved_at, "P")
    pdf.set_title(_latin1(f"Minutes: {m.title} - {m.reference}"))
    pdf.add_page()
    held = to_local(m.held_at)
    _title(pdf, "Minutes of Meeting")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, _latin1(m.title), new_x="LMARGIN", new_y="NEXT")
    where = "Online meeting (Yugantar Meetings)" if m.meeting_type == "online" else "In person"
    if m.location:
        where += f" - {m.location}"
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MID)
    pdf.cell(0, 5, _latin1(f"Held on {_long_day(m.held_at)}, {held:%H:%M} NPT  |  {where}"), new_x="LMARGIN", new_y="NEXT")
    _devanagari(pdf, _bs(m.held_at), 8.5)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MID)
    pdf.cell(0, 5, _latin1(f"Chaired by {m.chaired_by}  |  Minutes recorded by {m.recorded_by_name}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.ln(4)

    # Attendance
    present = len(m.attendees)
    share = f" ({round(100 * present / m.members_total)}%)" if m.members_total else ""
    _section(pdf, "Attendance", f"{present} of {m.members_total} members present{share}.")
    sig = {x.user_id: x for x in m.signatures}
    if sig:
        # Attendance doubles as the signature sheet
        has_images = any(signature_paths.get(a.id) for a in m.attendees)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_draw_color(*RULE)
        pdf.set_fill_color(255, 255, 255)
        with pdf.table(
            width=pdf.epw, align="LEFT", col_widths=(8, 52, 30, 30, 40),
            text_align=("CENTER", "LEFT", "LEFT", "LEFT", "CENTER"), line_height=10 if has_images else 5.4,
            borders_layout="HORIZONTAL_LINES", headings_style=TABLE_HEAD, v_align="MIDDLE", padding=(1, 1.6),
        ) as table:
            head = table.row()
            for h in ("No.", "Member", "Status", "Date (NPT)", "Signature"):
                head.cell(h)
            for i, a in enumerate(m.attendees, start=1):
                x = sig.get(a.id)
                status_text, colour = {
                    "signed": ("Signed", GREEN),
                    "declined": ("Declined", RED),
                }.get(x.status if x else "", ("Not signed yet", MUTED))
                row = table.row()
                row.cell(str(i))
                row.cell(_latin1(a.name))
                row.cell(status_text, style=FontFace(color=colour, emphasis="BOLD" if x and x.status != "pending" else None))
                row.cell(to_local(x.signed_at).strftime("%d %b %Y, %H:%M").lstrip("0") if x and x.signed_at else "-")
                path = signature_paths.get(a.id)
                if path:
                    row.cell(img=str(path), img_fill_width=False)
                else:
                    row.cell("-")
        declined = [x for x in m.signatures if x.status == "declined" and x.note]
        for x in declined:
            pdf.ln(0.5)
            _small(pdf, f"{x.name} declined to sign: {x.note}", color=RED, size=8)
        signed = sum(1 for x in m.signatures if x.status == "signed")
        _caption(pdf, [("Signatures", f"{signed} of {len(m.signatures)} members who attended have signed these minutes")])
    else:
        names = [a.name for a in m.attendees]
        half = (len(names) + 1) // 2
        rows = [[f"{i + 1}. {names[i]}", (f"{i + 1 + half}. {names[i + half]}" if i + half < len(names) else "")]
                for i in range(half)]
        if rows:
            _table(pdf, (pdf.epw / 2, pdf.epw / 2), ("LEFT", "LEFT"), None, rows, zebra=False)
    if m.guests:
        pdf.ln(1)
        _small(pdf, f"Also present (not members): {m.guests}", size=8.5)
    pdf.ln(4)

    # Proceedings
    _section(pdf, "Proceedings")
    for i, item in enumerate(m.agenda, start=1):
        _keep(pdf, 40)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.cell(0, 6.5, _latin1(f"{i}. {item.title}"), new_x="LMARGIN", new_y="NEXT")
        if item.discussion:
            _label(pdf, "Discussed")
            _para(pdf, item.discussion)
        if item.decision:
            _label(pdf, "Concluded")
            _para(pdf, item.decision)
        if item.vote:
            v = item.vote
            colour = GREEN if v.result == "passed" else RED
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*colour)
            pdf.cell(0, 5, _latin1(
                f"Vote ({CATEGORY.get(v.category, v.category)}): {v.votes_for} for, {v.votes_against} against, "
                f"{v.abstained} abstained of {present} present - {_result(v)}"
            ), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
        pdf.ln(3)

    votes = [(i, item) for i, item in enumerate(m.agenda, start=1) if item.vote]
    if votes:
        _keep(pdf, 20 + 7 * len(votes))
        _section(pdf, "Resolutions")
        _table(pdf, (10, 62, 30, 14, 16, 18, 30), ("CENTER", "LEFT", "LEFT", "RIGHT", "RIGHT", "RIGHT", "LEFT"),
               ("Item", "Resolution", "Category", "For", "Against", "Abstained", "Result"),
               [[str(i), item.title, CATEGORY.get(item.vote.category, item.vote.category), str(item.vote.votes_for),
                 str(item.vote.votes_against), str(item.vote.abstained),
                 "Passed" + (" (unan.)" if item.vote.unanimous else "") if item.vote.result == "passed" else "Not passed"]
                for i, item in votes], width=180)
        _caption(pdf, [("Majority", "a resolution passes when more members vote for it than against it"),
                       ("Present", f"{present} members")])
        pdf.ln(4)

    if m.other_business:
        _keep(pdf, 25)
        _section(pdf, "Any other business")
        _para(pdf, m.other_business)

    # Record and approval
    pdf.ln(3)
    _keep(pdf, 50)
    _section(pdf, "Record and approval")
    gap = 6
    w = (pdf.epw - gap) / 2
    y = pdf.get_y()
    blocks = (
        ("Recorded by", m.recorded_by_name, f"Submitted {format_local(m.submitted_at)}" if m.submitted_at else ""),
        ("Approved by", m.reviewed_by_name or "-", f"Approved in Yugantar {format_local(approved_at)}"),
    )
    for i, (role, name, when) in enumerate(blocks):
        x = pdf.l_margin + i * (w + gap)
        pdf.set_draw_color(*RULE)
        pdf.set_fill_color(*ZEBRA)
        pdf.rect(x, y, w, 34, style="DF", round_corners=True, corner_radius=1.5)
        pdf.set_xy(x + 4, y + 3)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w - 8, 4, role.upper(), new_x="LEFT", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(*INK)
        pdf.cell(w - 8, 5.5, _latin1(name), new_x="LEFT", new_y="NEXT")
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w - 8, 4, _latin1(when), new_x="LEFT", new_y="NEXT")
        pdf.set_draw_color(*MUTED)
        pdf.line(x + 20, y + 29, x + w - 5, y + 29)
        pdf.set_xy(x + 4, y + 25)
        pdf.cell(16, 4, "Signature")
    pdf.set_xy(pdf.l_margin, y + 40)
    _small(pdf, f"Reference {m.reference}. Approved in the Yugantar system; the SHA-256 checksum of this file is recorded "
                "with the minutes. A signed paper copy may be kept with the records.", size=8)
    pdf.alias_nb_pages()
    return bytes(pdf.output())

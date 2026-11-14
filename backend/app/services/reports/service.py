"""
Official financial reports: generate (figures -> PDF -> stored with a
reference number), list (the archive) and fetch. Two kinds, from the same
figures: the Monthly Financial Statement (contributions, loans issued, capital
due / advance) and the Monthly Accrual Report (principal outstanding,
interest, renewal / service charges, deposit fines).

Any active member may generate a report: the group is closed and the figures
are shared for transparency. A report is a snapshot; generating again gives
a new reference, the old one is kept unchanged.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.document_storage import document_storage
from app.models.report_model import GeneratedReport
from app.models.user_model import User
from app.services.duties import is_active_member, name_with_role
from app.services.reports.monthly_statement import MonthlyStatement, build_monthly_statement
from app.services.reports.statement_pdf import (
    ACCRUAL_REPORT,
    COMPLETE_REPORT,
    FINANCIAL_POSITION,
    FINANCIAL_STATEMENT,
    build_report_pdf,
)
from app.utils.local_time import to_local

# kind -> reference code: YUG/FS/2026/0001, YUG/AR/2026/0001
REFERENCE_CODES = {
    FINANCIAL_STATEMENT: "FS",
    ACCRUAL_REPORT: "AR",
    FINANCIAL_POSITION: "FP",
    COMPLETE_REPORT: "CR",
}
# Archived before the split into two reports (both parts in one PDF,
# YUG/RPT/...): listed and downloadable, no longer generated
LEGACY_KINDS = {"monthly_statement"}


def require_member(user: User) -> None:
    if not (user and is_active_member(user) and user.cooperative_roles):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reports are only available to members.")


def require_kind(kind: str) -> str:
    if kind not in REFERENCE_CODES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown report.")
    return kind


def next_reference(session: Session, kind: str, when: datetime) -> str:
    """YUG/FS/2026/0001: one sequence per kind and (Nepal) year."""
    prefix = f"YUG/{REFERENCE_CODES[kind]}/{to_local(when).year}/"
    taken = session.exec(select(GeneratedReport.reference).where(GeneratedReport.reference.like(f"{prefix}%"))).all()
    seq = max((int(ref.rsplit("/", 1)[1]) for ref in taken), default=0) + 1
    return f"{prefix}{seq:04d}"


class ReportService:
    def preview(self, session: Session, user: User, period_from: str, period_to: str) -> MonthlyStatement:
        require_member(user)
        return build_monthly_statement(session, period_from, period_to)

    def generate(self, session: Session, user: User, kind: str, period_from: str, period_to: str) -> GeneratedReport:
        require_member(user)
        require_kind(kind)
        now = datetime.now(timezone.utc)
        statement = build_monthly_statement(session, period_from, period_to, now)
        prepared_by = name_with_role(user) or f"{user.first_name} {user.last_name}".strip()
        # Two members generating at the same moment could pick the same next
        # number: the unique reference makes one fail; it then takes the next.
        for attempt in range(3):
            reference = next_reference(session, kind, now)
            data = build_report_pdf(statement, kind, reference, prepared_by, now)
            key, digest = document_storage.save(data, prefix="reports")
            report = GeneratedReport(
                kind=kind,
                reference=reference,
                period_from=statement.period_from,
                period_to=statement.period_to,
                generated_by=user.id,
                generated_by_name=prepared_by,
                generated_at=now,
                file_key=key,
                sha256=digest,
                size_bytes=len(data),
            )
            session.add(report)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                path = document_storage.path_for(key)
                if path:
                    path.unlink(missing_ok=True)
                if attempt == 2:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Couldn't number the report; please try again.")
                continue
            session.refresh(report)
            break
        return report

    def list(self, session: Session, user: User, kind: Optional[str] = None, limit: int = 50) -> list[GeneratedReport]:
        require_member(user)
        q = select(GeneratedReport)
        if kind:
            if kind not in LEGACY_KINDS:
                require_kind(kind)
            q = q.where(GeneratedReport.kind == kind)
        return list(session.exec(q.order_by(GeneratedReport.generated_at.desc()).limit(limit)).all())

    def pdf(self, session: Session, user: User, report_id) -> tuple[GeneratedReport, bytes]:
        require_member(user)
        report: Optional[GeneratedReport] = session.get(GeneratedReport, report_id)
        path = document_storage.path_for(report.file_key) if report else None
        if not report or not path or not path.is_file():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found.")
        return report, path.read_bytes()

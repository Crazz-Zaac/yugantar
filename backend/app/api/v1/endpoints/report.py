"""Financial reports (see services/reports/).

  GET  /reports/options              date range the pickers allow
  GET  /reports/preview              figures on screen (nothing stored)
  POST /reports/{kind}               official PDF: financial_statement | accrual_report |
                                     financial_position | complete_report
  GET  /reports                      the archive (optionally ?kind=)
  GET  /reports/{id}/pdf             download
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlmodel import Session

from app.api.dependencies.auth import get_current_user
from app.core.db import get_session
from app.models.user_model import User
from app.schemas.report_schema import DAY, GeneratedReportOut, ReportOptions, ReportRequest, StatementOut
from app.services.reports.monthly_statement import MAX_DAYS, first_day
from app.services.reports.service import ReportService, require_member
from app.utils.local_time import to_local

router = APIRouter(prefix="/reports", tags=["reports"])
service = ReportService()


@router.get("/options", response_model=ReportOptions)
def report_options(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    require_member(current_user)
    return ReportOptions(
        first_date=first_day(session),
        last_date=to_local(datetime.now(timezone.utc)).date().isoformat(),
        max_days=MAX_DAYS,
    )


@router.get("/preview", response_model=StatementOut)
def preview(
    date_from: str = Query(..., pattern=DAY),
    date_to: str = Query(..., pattern=DAY),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Both reports' figures for the range (nothing is stored)."""
    return StatementOut.of(service.preview(session, current_user, date_from, date_to))


@router.get("", response_model=list[GeneratedReportOut])
def archive(
    kind: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return service.list(session, current_user, kind, limit)


@router.get("/{report_id}/pdf")
def report_pdf(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    report, data = service.pdf(session, current_user, report_id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{report.reference.replace("/", "-")}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/{kind}", response_model=GeneratedReportOut, status_code=status.HTTP_201_CREATED)
def generate(
    kind: str,
    data: ReportRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Generate an official PDF: it gets a reference number and is kept."""
    return service.generate(session, current_user, kind, data.date_from, data.date_to)

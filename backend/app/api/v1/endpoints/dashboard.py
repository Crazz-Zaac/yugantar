from fastapi import APIRouter, Depends, Request
from app import i18n
from sqlmodel import Session

from app.api.dependencies.admin import get_current_admin
from app.api.dependencies.auth import get_current_active_user
from app.core.db import get_session
from app.models.user_model import User
from typing import List

from fastapi import Query

from app.schemas.dashboard_schema import ActivityEvent, AdminDashboard, MemberDashboard
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
service = DashboardService()


@router.get("/me", response_model=MemberDashboard)
def member_dashboard(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The signed-in member's Home: savings, next due date, loan, history and
    everything waiting for their action."""
    data = service.member(session, current_user)
    lang = i18n.request_lang(request)
    if lang != "en":
        for item in data.actions:
            item.title = i18n.translate_text(item.title, lang)
            item.detail = i18n.translate_text(item.detail, lang)
        for item in data.recent:
            item.description = i18n.translate_text(item.description, lang)
        if data.next_due is not None:
            data.next_due.policy_label = i18n.translate_text(data.next_due.policy_label, lang)
    return data


@router.get("/admin", response_model=AdminDashboard)
def admin_dashboard(
    request: Request,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Admin Overview: members, cooperative totals, open policies, trends."""
    data = service.admin(session)
    lang = i18n.request_lang(request)
    if lang != "en":
        for p in data.open_policies:
            p.label = i18n.translate_text(p.label, lang)
    return data


@router.get("/activity", response_model=List[ActivityEvent])
def activity_log(
    request: Request,
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Admin activity log: registrations, deposits, loans, payments and policy
    signatures, newest first."""
    events = service.activity(session, limit)
    lang = i18n.request_lang(request)
    if lang != "en":
        for ev in events:
            ev.action = i18n.translate_text(ev.action, lang)
    return events

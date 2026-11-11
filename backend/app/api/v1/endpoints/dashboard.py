from fastapi import APIRouter, Depends
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
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The signed-in member's Home: savings, next due date, loan, history and
    everything waiting for their action."""
    return service.member(session, current_user)


@router.get("/admin", response_model=AdminDashboard)
def admin_dashboard(
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Admin Overview: members, cooperative totals, open policies, trends."""
    return service.admin(session)


@router.get("/activity", response_model=List[ActivityEvent])
def activity_log(
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Admin activity log: registrations, deposits, loans, payments and policy
    signatures, newest first."""
    return service.activity(session, limit)

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_session
from app.api.dependencies.auth import get_current_active_user
from app.models.user_model import User
from app.models.policy_change_request_model import PolicyChangeStatus
from app.schemas.policy_change_schema import (
    PolicyChangeCreate,
    PolicyChangeDecision,
    PolicyChangeResponse,
)
from app.services.policy_change_service import PolicyChangeService
from app.services.duties import is_office_bearer, is_system_admin

router = APIRouter(prefix="/policy-changes", tags=["policy-changes"])
service = PolicyChangeService()


@router.post("", response_model=PolicyChangeResponse, status_code=status.HTTP_201_CREATED)
def create_policy_change(
    req: PolicyChangeCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Treasurer requests retiring an active policy (awaits President approval)."""
    return service.create_request(session, background_tasks, req, current_user)


@router.get("", response_model=list[PolicyChangeResponse])
def list_policy_changes(
    status_filter: Optional[PolicyChangeStatus] = Query(None, alias="status"),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The audit log of retirement requests. Office bearers and the Admin can
    read it; the Admin sees everything for traceability."""
    if not (is_office_bearer(current_user) or is_system_admin(current_user)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to view policy change requests.")
    return service.list_requests(session, status_filter)


@router.post("/{request_id}/approve", response_model=PolicyChangeResponse)
def approve_policy_change(
    request_id: UUID,
    decision: PolicyChangeDecision,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """President approves: the policy is retired (marked expired, record kept)."""
    return service.approve(session, background_tasks, request_id, decision.note, current_user)


@router.post("/{request_id}/reject", response_model=PolicyChangeResponse)
def reject_policy_change(
    request_id: UUID,
    decision: PolicyChangeDecision,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """President rejects the retirement request (policy stays active)."""
    return service.reject(session, background_tasks, request_id, decision.note, current_user)

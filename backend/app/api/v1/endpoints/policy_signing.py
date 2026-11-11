"""
Policy approval by member signatures (see services/policy_signing_service.py).

  POST /policies/{type}/{id}/submit      Treasurer signs and opens it for signing
  POST /policies/{type}/{id}/withdraw    Treasurer pulls it back to draft to revise
  GET  /policies/{type}/{id}/signatures  Who has signed (any member)
  POST /policies/{type}/{id}/sign        Approve or reject (required signers)
  POST /policies/{type}/{id}/proxy-requests   Admin: sign on behalf of an absent member
  GET  /policies/proxy-requests               Admin / office bearers
  POST /policies/proxy-requests/{id}/authorise  President / Treasurer / Secretary
  POST /policies/proxy-requests/{id}/cancel     Admin
"""

from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel import Session

from app.api.dependencies.admin import get_current_policy_manager
from app.api.dependencies.auth import get_current_active_user
from app.core.db import get_session
from app.models.policy.policy_signature import ProxyRequestStatus
from app.models.user_model import User
from app.schemas.policy.policy_signing_schema import (
    ProxyAuthoriseRequest,
    ProxyRequestCreate,
    ProxyRequestOut,
    SigningSummary,
    SignRequest,
)
from app.services.policy_signing_service import PolicySigningService

router = APIRouter(prefix="/policies", tags=["policy signing"])
service = PolicySigningService()
PolicyType = Literal["deposit", "loan"]


# Proxy-request routes first so "proxy-requests" is never read as a policy type
@router.get("/proxy-requests", response_model=List[ProxyRequestOut])
def list_proxy_requests(
    status: Optional[ProxyRequestStatus] = None,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Proxy-signing requests (Admin and office bearers)."""
    return service.list_proxy_requests(session, current_user, status)


@router.post("/proxy-requests/{request_id}/authorise", response_model=ProxyRequestOut)
def authorise_proxy_request(
    request_id: UUID,
    body: ProxyAuthoriseRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """President / Treasurer / Secretary authorise (or decline) a proxy signature."""
    return service.authorise_proxy(
        session, background_tasks, request_id, current_user, body.approve, body.note
    )


@router.post("/proxy-requests/{request_id}/cancel", response_model=ProxyRequestOut)
def cancel_proxy_request(
    request_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    return service.cancel_proxy(session, request_id, current_user)


@router.post("/{policy_type}/{policy_id}/submit", response_model=SigningSummary)
def open_policy_for_signing(
    policy_type: PolicyType,
    policy_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """Treasurer signs the draft and opens it for every member to sign."""
    service.open_for_signing(session, background_tasks, policy_type, policy_id, current_user)
    return service.summary(session, policy_type, policy_id, current_user)


@router.post("/{policy_type}/{policy_id}/withdraw", response_model=SigningSummary)
def withdraw_policy(
    policy_type: PolicyType,
    policy_id: UUID,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """Treasurer withdraws an open policy back to draft (clears signatures)."""
    service.withdraw(session, policy_type, policy_id, current_user)
    return service.summary(session, policy_type, policy_id, current_user)


@router.get("/{policy_type}/{policy_id}/signatures", response_model=SigningSummary)
def get_policy_signatures(
    policy_type: PolicyType,
    policy_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Signing progress, with each member's name, date and decision."""
    return service.summary(session, policy_type, policy_id, current_user)


@router.post("/{policy_type}/{policy_id}/sign", response_model=SigningSummary)
def sign_policy(
    policy_type: PolicyType,
    policy_id: UUID,
    body: SignRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Approve (sign) or reject an open policy. You can change your response
    while the policy is open."""
    return service.sign(
        session, background_tasks, policy_type, policy_id, current_user, body.decision, body.reason
    )


@router.post("/{policy_type}/{policy_id}/proxy-requests", response_model=ProxyRequestOut)
def create_proxy_request(
    policy_type: PolicyType,
    policy_id: UUID,
    body: ProxyRequestCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Admin requests to sign on behalf of an absent member (after consulting
    them). Applied only once the President, Treasurer and Secretary authorise it."""
    return service.create_proxy_request(
        session, background_tasks, policy_type, policy_id, current_user,
        body.signer_user_id, body.decision, body.reason, body.consultation_note,
    )

from typing import List, Optional
from fastapi import APIRouter, Depends, Request, HTTPException, status, BackgroundTasks
from sqlmodel import Session, select
from uuid import UUID
from datetime import datetime, timezone

from app.core.db import get_session
from app.models.policy.deposit_policy import DepositPolicy
from app.models.policy.base_policy import PolicyStatus
from app.schemas.policy.deposit_policy_schema import (
    DepositPolicyCreate,
    DepositPolicyUpdate,
    DepositPolicyResponse,
)
from app.services.deposit_policy_service import DepositPolicyService
from app.services.policy_lifecycle import current_deposit_policy
from app.api.dependencies.admin import get_current_policy_manager
from app.api.dependencies.auth import get_current_user
from app.models.user_model import User, CooperativeRole
from app.models.notification_model import Notification, NotificationType
from app.services.email_notify import send_generic_email
from fastapi_mail import NameEmail


router = APIRouter(prefix="/policies", tags=["policies"])


@router.get(
    "/deposit",
    response_model=List[DepositPolicyResponse],
    status_code=status.HTTP_200_OK,
)
def list_deposit_policies(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all deposit policies.
    Any authenticated user can view policies.
    """
    statement = select(DepositPolicy)
    policies = session.exec(statement).all()
    return policies


@router.get(
    "/deposit/current",
    response_model=Optional[DepositPolicyResponse],
    status_code=status.HTTP_200_OK,
)
def get_current_deposit_policy(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The deposit policy every deposit must use right now (null if none):
    active, started, not ended, most recent start date."""
    return current_deposit_policy(session)


@router.post(
    "/deposit",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_deposit_policy(
    policy_in: DepositPolicyCreate,
    request: Request,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Create a new deposit policy.
    Only Treasurer, Moderator, or Admin can perform this action.
    Policy is always created as DRAFT. Treasurer must explicitly submit it for review.
    """
    # Force draft status — Treasurer must submit separately
    policy_in.status = PolicyStatus.DRAFT

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    new_policy = deposit_policy_service.create_deposit_policy(
        session=session,
        policy_in=policy_in,
        ip_address=client_ip,
        user_agent=user_agent,
        created_by=current_user.email,
    )

    return new_policy


@router.delete(
    "/deposit/{policy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_deposit_policy(
    policy_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Delete an existing deposit policy.
    Only Treasurer, Moderator, or Admin can perform this action.
    """

    deposit_policy_service.delete_policy(
        db_session=session,
        policy_id=policy_id,
        policy_class=DepositPolicy,
    )
    return None


@router.put(
    "/deposit/{policy_id}",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def update_deposit_policy(
    policy_id: UUID,
    policy_in: DepositPolicyUpdate,
    request: Request,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Update an existing deposit policy.
    Only Treasurer, Moderator, or Admin can perform this action.
    Only DRAFT policies can be edited.
    """
    # Verify policy is still in draft
    statement = select(DepositPolicy).where(DepositPolicy.policy_id == policy_id)
    existing = session.exec(statement).first()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deposit policy not found.",
        )
    if existing.status != PolicyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only draft policies can be edited. Current status: {existing.status.value}",
        )

    # Prevent status from being changed via update
    policy_in.status = None

    client_ip = request.client.host if request.client else None

    change_reason = policy_in.change_reason
    if not change_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Change reason must be provided for updating the policy.",
        )

    updated_policy = deposit_policy_service.update_deposit_policy(
        session=session,
        policy_id=policy_id,
        policy_in=policy_in,
        ip_address=client_ip,
        updated_by=current_user.email,
        change_reason=policy_in.change_reason,
    )
    return updated_policy

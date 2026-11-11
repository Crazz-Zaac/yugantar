from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException, status, BackgroundTasks
from sqlmodel import Session, select
from uuid import UUID
from datetime import datetime, timezone

from app.core.db import get_session
from app.models.policy.loan_policy import LoanPolicy
from app.models.policy.base_policy import PolicyStatus
from app.schemas.policy.loan_policy_schema import (
    LoanPolicyCreate,
    LoanPolicyUpdate,
    LoanPolicyResponse,
)
from app.services.loan_policy_service import LoanPolicyService
from app.api.dependencies.admin import get_current_policy_manager
from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.models.user_model import User, CooperativeRole
from app.models.notification_model import Notification, NotificationType
from app.services.email_notify import send_generic_email
from fastapi_mail import NameEmail

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get(
    "/loan",
    response_model=List[LoanPolicyResponse],
    status_code=status.HTTP_200_OK,
)
def list_loan_policies(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all loan policies.
    Any authenticated user can view policies.
    """
    statement = select(LoanPolicy)
    policies = session.exec(statement).all()
    return policies


@router.post(
    "/loan",
    response_model=LoanPolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_loan_policy(
    policy_in: LoanPolicyCreate,
    request: Request,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Create a new loan policy.
    Only Treasurer, Moderator, or Admin can perform this action.
    Policy is always created as DRAFT. Treasurer must explicitly submit it for review.
    """
    # Force draft status — Treasurer must submit separately
    policy_in.status = PolicyStatus.DRAFT

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    new_policy = loan_policy_service.create_loan_policy(
        session=session,
        policy_in=policy_in,
        ip_address=client_ip,
        user_agent=user_agent,
        created_by=current_user.email,
    )

    return new_policy


@router.delete(
    "/loan/{policy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_loan_policy(
    policy_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Delete an existing loan policy.
    Only Treasurer, Moderator, or Admin can perform this action.
    """

    loan_policy_service.delete_policy(
        db_session=session,
        policy_id=policy_id,
        policy_class=LoanPolicy,
    )
    return None


@router.put(
    "/loan/{policy_id}",
    response_model=LoanPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def update_loan_policy(
    policy_id: UUID,
    policy_in: LoanPolicyUpdate,
    request: Request,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Update an existing loan policy.
    Only Treasurer, Moderator, or Admin can perform this action.
    Only DRAFT policies can be edited.
    """
    # Verify policy is still in draft
    statement = select(LoanPolicy).where(LoanPolicy.policy_id == policy_id)
    existing = session.exec(statement).first()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan policy not found.",
        )
    if existing.status != PolicyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only draft policies can be edited. Current status: {existing.status.value}",
        )

    # Prevent status from being changed via update
    policy_in.status = None

    client_ip = request.client.host if request.client else None

    if not policy_in.change_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Change reason must be provided for updating a loan policy.",
        )

    updated_policy = loan_policy_service.update_loan_policy(
        session=session,
        policy_id=policy_id,
        policy_in=policy_in,
        updated_by=current_user.email,
        change_reason=policy_in.change_reason,
        ip_address=client_ip,
    )
    return updated_policy

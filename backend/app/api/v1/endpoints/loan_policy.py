from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlmodel import Session
from uuid import UUID
from datetime import datetime

from app.core.db import get_session
from app.schemas.policy.loan_policy_schema import (
    LoanPolicyCreate,
    LoanPolicyUpdate,
    LoanPolicyResponse,
)
from app.services.loan_policy_service import LoanPolicyService
from app.api.dependencies.admin import get_current_moderator_or_admin
from app.core.config import settings
from app.models.user_model import User

router = APIRouter(prefix="/policies", tags=["policies"])

loan_policy_service = LoanPolicyService()


@router.post(
    "/loan",
    response_model=LoanPolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_loan_policy(
    policy_in: LoanPolicyCreate,
    request: Request,
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Create a new loan policy.
    Only moderators and admins can perform this action.
    """
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


@router.put(
    "/loan/{policy_id}",
    response_model=LoanPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def update_loan_policy(
    policy_id: UUID,
    policy_in: LoanPolicyUpdate,
    request: Request,
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Update an existing loan policy.
    Only moderators and admins can perform this action.
    """
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

from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlmodel import Session
from uuid import UUID
from datetime import datetime

from app.core.db import get_session
from app.schemas.policy.deposit_policy_schema import (
    DepositPolicyCreate,
    DepositPolicyUpdate,
    DepositPolicyResponse,
)
from app.services.deposit_policy_service import DepositPolicyService
from app.api.dependencies.admin import get_current_moderator_or_admin
from app.core.config import settings
from app.models.user_model import User


router = APIRouter(prefix="/policies", tags=["policies"])

deposit_policy_service = DepositPolicyService()


@router.post(
    "/deposit",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_deposit_policy(
    policy_in: DepositPolicyCreate,
    request: Request,
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Create a new deposit policy.
    Only moderators and admins can perform this action.
    """
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


@router.put(
    "/deposit/{policy_id}",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def update_deposit_policy(
    policy_id: UUID,
    policy_in: DepositPolicyUpdate,
    request: Request,
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Update an existing deposit policy.
    Only moderators and admins can perform this action.
    """
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

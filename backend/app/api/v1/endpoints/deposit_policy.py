from typing import List
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
from app.api.dependencies.admin import get_current_moderator_or_admin
from app.api.dependencies.auth import get_current_user
from app.models.user_model import User, CooperativeRole
from app.models.notification_model import Notification, NotificationType
from app.services.email_notify import send_generic_email
from fastapi_mail import NameEmail


router = APIRouter(prefix="/policies", tags=["policies"])

deposit_policy_service = DepositPolicyService()


def _notify_presidents(
    session: Session,
    background_tasks: BackgroundTasks,
    policy: DepositPolicy,
    submitted_by_name: str,
):
    """Create in-app notifications and send emails to all Presidents."""
    all_users = session.exec(select(User)).all()
    presidents = [
        u
        for u in all_users
        if CooperativeRole.PRESIDENT.value in (u.cooperative_roles or [])
    ]

    amount_rs = float(policy.amount_paisa) / 100
    for president in presidents:
        notif = Notification(
            user_id=president.id,
            title="Deposit Policy Submitted for Approval",
            message=(
                f"{submitted_by_name} has submitted a deposit policy "
                f"(Rs. {amount_rs:,.2f}, {policy.schedule_type.value}) "
                f"for your review and approval."
            ),
            notification_type=NotificationType.POLICY_APPROVAL,
            policy_id=policy.policy_id,
            policy_type="deposit",
        )
        session.add(notif)

        background_tasks.add_task(
            send_generic_email,
            [NameEmail(name=president.first_name, email=president.email)],
            "Deposit Policy Awaiting Your Approval — Yugantar",
            f"Hello {president.first_name},\n\n"
            f"{submitted_by_name} has submitted a deposit policy for your approval.\n\n"
            f"Amount: Rs. {amount_rs:,.2f}\n"
            f"Schedule: {policy.schedule_type.value.replace('_', ' ').title()}\n"
            f"Effective from: {policy.effective_from.strftime('%Y-%m-%d')}\n\n"
            f"Please log in to the Yugantar portal to review and approve or reject this policy.\n\n"
            f"Best regards,\nYugantar System",
        )

    session.commit()


def _notify_creator(
    session: Session,
    background_tasks: BackgroundTasks,
    policy: DepositPolicy,
    action: str,
    president_name: str,
):
    """Notify the policy creator about the President's decision."""
    if not policy.created_by:
        return
    creator = session.exec(select(User).where(User.email == policy.created_by)).first()
    if not creator:
        return

    amount_rs = float(policy.amount_paisa) / 100
    is_approved = action == "approved"
    notif = Notification(
        user_id=creator.id,
        title=f"Deposit Policy {'Approved' if is_approved else 'Rejected'}",
        message=(
            f"President {president_name} has {action} the deposit policy "
            f"(Rs. {amount_rs:,.2f}, {policy.schedule_type.value})."
        ),
        notification_type=(
            NotificationType.POLICY_APPROVED
            if is_approved
            else NotificationType.POLICY_REJECTED
        ),
        policy_id=policy.policy_id,
        policy_type="deposit",
    )
    session.add(notif)
    session.commit()

    background_tasks.add_task(
        send_generic_email,
        [NameEmail(name=creator.first_name, email=creator.email)],
        f"Deposit Policy {action.title()} — Yugantar",
        f"Hello {creator.first_name},\n\n"
        f"President {president_name} has {action} the deposit policy you submitted.\n\n"
        f"Amount: Rs. {amount_rs:,.2f}\n"
        f"Schedule: {policy.schedule_type.value.replace('_', ' ').title()}\n"
        f"New Status: {policy.status.value.upper()}\n\n"
        f"Best regards,\nYugantar System",
    )


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


@router.post(
    "/deposit/{policy_id}/submit",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def submit_deposit_policy(
    policy_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Submit a draft deposit policy for President review.
    Sets status from DRAFT → FINALIZED and notifies all Presidents.
    """
    statement = select(DepositPolicy).where(DepositPolicy.policy_id == policy_id)
    policy = session.exec(statement).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deposit policy not found.",
        )

    if policy.status != PolicyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only draft policies can be submitted for review. Current status: {policy.status.value}",
        )

    policy.status = PolicyStatus.FINALIZED
    policy.updated_by = current_user.email
    policy.updated_at = datetime.now(timezone.utc)
    session.add(policy)
    session.commit()
    session.refresh(policy)

    # Notify presidents
    submitter_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_presidents(session, background_tasks, policy, submitter_name)

    return policy


@router.post(
    "/deposit/{policy_id}/approve",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def approve_deposit_policy(
    policy_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Approve a finalized deposit policy (set status to ACTIVE).
    Only users with the President cooperative role can approve.
    """
    if CooperativeRole.PRESIDENT.value not in (current_user.cooperative_roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the President can approve policies.",
        )

    statement = select(DepositPolicy).where(DepositPolicy.policy_id == policy_id)
    policy = session.exec(statement).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deposit policy not found.",
        )

    if policy.status != PolicyStatus.FINALIZED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only finalized policies can be approved. Current status: {policy.status.value}",
        )

    policy.status = PolicyStatus.ACTIVE
    policy.updated_by = current_user.email
    policy.updated_at = datetime.now(timezone.utc)
    session.add(policy)
    session.commit()
    session.refresh(policy)

    # Notify creator
    president_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_creator(session, background_tasks, policy, "approved", president_name)

    return policy


@router.post(
    "/deposit/{policy_id}/reject",
    response_model=DepositPolicyResponse,
    status_code=status.HTTP_200_OK,
)
def reject_deposit_policy(
    policy_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Reject a finalized deposit policy (set status to VOID).
    Only users with the President cooperative role can reject.
    """
    if CooperativeRole.PRESIDENT.value not in (current_user.cooperative_roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the President can reject policies.",
        )

    statement = select(DepositPolicy).where(DepositPolicy.policy_id == policy_id)
    policy = session.exec(statement).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deposit policy not found.",
        )

    if policy.status != PolicyStatus.FINALIZED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only finalized policies can be rejected. Current status: {policy.status.value}",
        )

    policy.status = PolicyStatus.VOID
    policy.updated_by = current_user.email
    policy.updated_at = datetime.now(timezone.utc)
    session.add(policy)
    session.commit()
    session.refresh(policy)

    # Notify creator
    president_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_creator(session, background_tasks, policy, "rejected", president_name)

    return policy


@router.delete(
    "/deposit/{policy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_deposit_policy(
    policy_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Delete an existing deposit policy.
    Only moderators and admins can perform this action.
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
    current_user: User = Depends(get_current_moderator_or_admin),
    session: Session = Depends(get_session),
):
    """
    Update an existing deposit policy.
    Only moderators and admins can perform this action.
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

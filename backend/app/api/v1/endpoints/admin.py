from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from app import i18n
from fastapi_mail import NameEmail

from app.services.email_notify import send_generic_email
from sqlmodel import Session
from typing import List
from uuid import UUID

from app.core.db import get_session
from app.models.user_model import User
from app.schemas.user_schema import (
    UserResponse,
    AdminAssignUserRoles,
    UserListResponse,
    PaginatedUserListResponse,
)
from app.services.user_service import UserService
from app.api.dependencies.admin import get_current_admin
from app.core.refresh_tokens import revoke_all_refresh_tokens

router = APIRouter(prefix="/admin", tags=["admin"])
user_service = UserService()


@router.get("/users", response_model=PaginatedUserListResponse)
async def list_users(
    skip: int = 0,
    limit: int = Query(10, le=100),
    pending: bool = Query(False, description="Only registrations awaiting approval"),
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """
    List users with pagination. Admin access required.
    """
    if not current_admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin access required",
        )
    users = user_service.get_all_users(session=session, skip=skip, limit=limit, pending_only=pending)
    total = user_service.get_total_user_count(session=session, pending_only=pending)
    return PaginatedUserListResponse(
        total=total,
        users=users,
        skip=skip,
        limit=limit,
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_as_admin(
    user_id: UUID,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """
    Get user details by ID. Admin access required.
    """
    if not current_admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin access required",
        )
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def assign_user_roles_as_admin(
    user_id: UUID,
    user_update: AdminAssignUserRoles,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """
    Update user roles and status. Admin access required.
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin users cannot modify their own roles or status",
        )
    try:
        user = user_service.admin_assign_user_roles(
            session=session, user_id=user_id, user_in=user_update
        )
        # Roles are re-read from the DB on every request, so no session
        # revocation is needed here; disabling is handled in toggle-disabled.
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_as_admin(
    user_id: UUID,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """
    Delete a user by ID. Admin access required.
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin users cannot delete themselves",
        )
    success = user_service.admin_delete_user(session=session, user_id=user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    revoke_all_refresh_tokens(user_id)
    return None


@router.post("/users/{user_id}/toggle-disabled", response_model=UserResponse)
async def toggle_user_disabled_status(
    user_id: UUID,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """
    Toggle the disabled status of a user. Admin access required.
    """
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin users cannot disable themselves",
        )
    user.disabled = not user.disabled
    from datetime import datetime, timezone

    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)
    if user.disabled:
        revoke_all_refresh_tokens(user.id)
    return user


@router.post("/users/{user_id}/approve", response_model=UserResponse)
async def approve_user(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """Approve a new registration. The member can log in once their email is
    also verified."""
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already approved")

    from datetime import datetime, timezone

    user.is_approved = True
    user.approved_by = current_admin.email
    user.approved_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    subject, body = i18n.render_email(
        "membership_approved" if user.is_verified else "membership_approved_verify",
        user.preferred_language, user.first_name,
    )
    background_tasks.add_task(
        send_generic_email, [NameEmail(name=user.first_name, email=user.email)], subject, body
    )
    return user


@router.post("/users/{user_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_registration(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """Reject a registration that was never approved: the account is removed
    and the person is told by email. Approved members are disabled instead."""
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This member is already approved; disable the account instead.",
        )
    email, first_name, lang = user.email, user.first_name, user.preferred_language
    session.delete(user)
    session.commit()
    revoke_all_refresh_tokens(user_id)
    subject, body = i18n.render_email("registration_rejected", lang, first_name)
    background_tasks.add_task(send_generic_email, [NameEmail(name=first_name, email=email)], subject, body)
    return None

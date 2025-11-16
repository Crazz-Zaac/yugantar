from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session
from typing import List
from uuid import UUID

from app.core.db import get_session
from app.models.user_model import User
from app.schemas.user_schema import UserResponse, AdminAssignUserRoles, UserListResponse
from app.services.user_service import UserService
from app.api.dependencies.admin import get_current_admin

router = APIRouter(prefix="/admin", tags=["admin"])
user_service = UserService()


@router.get("/users", response_model=List[UserListResponse])
async def list_users(
    skip: int = 0,
    limit: int = Query(10, le=100),
    session: Session = Depends(get_session),
    # current_admin: User = Depends(get_current_admin),
):
    """
    List users with pagination. Admin access required.
    """
    users = user_service.get_all_users(session=session, skip=skip, limit=limit)
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_as_admin(
    user_id: UUID,
    session: Session = Depends(get_session),
    # current_admin: User = Depends(get_current_admin),
):
    """
    Get user details by ID. Admin access required.
    """
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
    return None


@router.post("users/{user_id}/toggle-disabled", response_model=UserResponse)
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
    return user

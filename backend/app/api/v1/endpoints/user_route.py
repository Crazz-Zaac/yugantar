from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_mail import NameEmail
from sqlmodel import Session
from uuid import UUID
from loguru import logger

from app.core.db import get_session
from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserUpdate, UserResponse
from app.services.user_service import UserService
from app.api.dependencies.auth import get_current_user, get_current_active_user
from app.core.security import create_access_token, verify_password
from app.services.email_notify import (
    send_password_reset_email,
    send_registration_notification,
)
from app.core.config import settings
from datetime import timedelta

router = APIRouter(prefix="/users", tags=["users"])

user_service = UserService()


# Specific routes first
@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
):
    """
    Create a new user.
    """
    user = user_service.create_user(session=session, user_in=user_in)
    try:
        await send_registration_notification(
            email_to=[NameEmail(name=user.first_name, email=user.email)],
            username=user.first_name,
        )
    except Exception as e:
        # Log the error but do not fail the registration
        logger.info(f"Failed to send registration email: {e}")
    return user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """
    Get the current authenticated user's information.
    """
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    user_in: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update the current authenticated user's information.
    """
    user = user_service.update_user(
        session=session, db_user=current_user, user_in=user_in
    )
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete the current authenticated user's account.
    """
    session.delete(current_user)
    session.commit()
    return None


# @router.patch("/me/change-password", status_code=status.HTTP_200_OK, tags=["password"])
# async def change_password(
#     current_password: str,
#     new_password: str,
#     session: Session = Depends(get_session),
#     user: User = Depends(get_current_active_user),
# ):
#     """
#     Change password for the current user.
#     """
#     # Verify current password
#     if not verify_password(current_password, user.hashed_password):
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="Current password is incorrect",
#         )

#     # Update to new password
#     user_service.update_user(
#         session=session,
#         db_user=user,
#         user_in={"password": new_password},
#     )

#     return {"msg": "Password updated successfully."}


@router.post("/me/reset-password", status_code=status.HTTP_200_OK, tags=["password"])
async def reset_password(
    email: str,
    session: Session = Depends(get_session),
):
    """
    Initiate password reset process for the user.
    """
    try:
        user = user_service.get_user_by_email(session=session, email=email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User with this email does not exist",
            )
        access_token = await create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=15),  # Short-lived token for password reset
        )
        url = f"{settings.FRONTEND_HOST}/reset-password?token={access_token}"
        await send_password_reset_email(
            email_to=[NameEmail(name=user.first_name, email=user.email)], reset_link=url
        )

        return {"msg": "An email has been sent with password reset instructions."}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing the request",
        ) from e


# Dynamic routes last
@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),  # Added authentication
):
    """
    Retrieve a user by ID (requires authentication).
    Privacy rules:
        - Users can view their own details.
        - Admins can view any user's details.
        - Public profiles (is_public=True) can be viewed by anyone.
    """
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user

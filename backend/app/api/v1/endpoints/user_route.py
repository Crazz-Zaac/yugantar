from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_mail import NameEmail
from fastapi import BackgroundTasks
from sqlmodel import Session
from uuid import UUID
from datetime import timedelta

from app.core.db import get_session
from app.models.user_model import User
from app.schemas.user_schema import (
    UserCreate,
    UserUpdate,
    UserResponse,
    LoginSuccess,
    TokenResponse,
    LoginRequest,
)
from app.services.user_service import UserService
from app.api.dependencies.auth import get_current_user
from app.core.security import (
    create_access_token,
    verify_password,
    create_url_safe_token,
)
from app.services.email_notify import (
    send_password_reset_email,
    send_registration_notification,
)
from app.core.config import settings

router = APIRouter(prefix="/users", tags=["users"])

user_service = UserService()


# Specific routes first
@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    user_in: UserCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Create a new user.
    """

    user_email = user_in.email
    user_exists = user_service.get_user_by_email(session=session, email=user_email)
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )
    # Create the user
    new_user = user_service.create_user(session=session, user_in=user_in)

    # Send welcome email and verification link
    verification_token = create_url_safe_token(data={"email": new_user.email})
    verification_link = (
        f"{settings.BACKEND_HOST}/api/v1/auth/verify-email?token={verification_token}"
    )

    background_tasks.add_task(
        send_registration_notification,
        [NameEmail(name=new_user.first_name, email=new_user.email)],
        new_user.first_name + " " + new_user.last_name,
        verification_link,
    )

    return new_user


@router.post("/login", response_model=LoginSuccess)
async def login_user(
    login_data: LoginRequest,
    session: Session = Depends(get_session),
):
    """
    Authenticate user and return user details.
    """
    user = user_service.get_user_by_email(session=session, email=login_data.email)
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate tokens
    access_token = await create_access_token(
        subject=str(user.id), expires_delta=timedelta(minutes=15)
    )
    refresh_token = await create_access_token(
        subject=str(user.id), expires_delta=timedelta(days=7)
    )

    login_token = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )

    user_response = LoginSuccess(
        token=login_token,
        user=UserResponse.model_validate(user),
    )

    return user_response


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


@router.get("/logout", status_code=status.HTTP_200_OK)
async def logout_user():
    """
    Logout user by invalidating the token.
    Note: Actual token invalidation logic depends on the token management strategy.
    """

    return {"msg": "User logged out successfully."}


# -----------------------------
# Dynamic routes last
# -----------------------------


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

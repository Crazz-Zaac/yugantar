from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
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
    UserPasswordChange,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from app.services.user_service import UserService
from app.api.dependencies.auth import get_current_user
from app.core.security import (
    create_access_token,
    verify_password,
    create_url_safe_token,
    create_password_reset_token,
    read_password_reset_token,
    password_fingerprint_matches,
)
from app.services.email_notify import (
    send_password_reset_email,
    send_registration_notification,
)
from app.core.config import settings
from app.core.refresh_tokens import (
    issue_refresh_token,
    revoke_refresh_token,
    revoke_all_refresh_tokens,
    set_refresh_cookie,
)

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
        f"{settings.FRONTEND_HOST}/verify-email?token={verification_token}"
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
    reponse: Response,
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

    # Generate access tokens
    access_token = await create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    # refresh token: opaque, stored in Redis, sent as httpOnly cookie only
    set_refresh_cookie(reponse, issue_refresh_token(user.id))

    login_token = TokenResponse(
        access_token=access_token,
        refresh_token="",  # Don't leak refresh token in response body
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
    user_id = current_user.id
    session.delete(current_user)
    session.commit()
    revoke_all_refresh_tokens(user_id)
    return None


@router.post("/me/reset-password", status_code=status.HTTP_200_OK, tags=["password"])
async def reset_password(
    payload: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Start the password reset flow.

    Always returns the same response so it can't be used to discover which
    emails are registered. The email contains a single-purpose reset token
    (not a login token) valid for 30 minutes.
    """
    user = user_service.get_user_by_email(session=session, email=payload.email.lower())
    if user:
        token = create_password_reset_token(user.id, user.hashed_password)
        url = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
        background_tasks.add_task(
            send_password_reset_email,
            email_to=[NameEmail(name=user.first_name, email=user.email)],
            reset_link=url,
        )

    return {"msg": "If an account exists for this email, a reset link has been sent."}


@router.post("/reset-password/confirm", status_code=status.HTTP_200_OK, tags=["password"])
async def confirm_password_reset(
    payload: PasswordResetConfirm,
    session: Session = Depends(get_session),
):
    """
    Complete the password reset using the token from the email.
    The token is single-use: it stops working once the password changes.
    All existing sessions are logged out.
    """
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset token",
    )
    try:
        data = read_password_reset_token(payload.token)
        user = user_service.get_user_by_id(session=session, user_id=UUID(data["uid"]))
    except ValueError:
        raise invalid

    if (
        not user
        or user.disabled
        or not password_fingerprint_matches(user.hashed_password, data["fp"])
    ):
        raise invalid

    user_service.change_user_password(
        session=session, user=user, new_password=payload.new_password
    )
    revoke_all_refresh_tokens(user.id)
    return {"msg": "Password has been reset. Please log in with your new password."}


@router.post("/me/change-password", status_code=status.HTTP_200_OK, tags=["password"])
async def change_password(
    payload: UserPasswordChange,
    response: Response,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Change the current authenticated user's password.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    user_service.change_user_password(
        session=session, user=current_user, new_password=payload.new_password
    )
    # Log out every other session; keep this one with a fresh refresh token
    revoke_all_refresh_tokens(current_user.id)
    set_refresh_cookie(response, issue_refresh_token(current_user.id))
    return {"msg": "Password changed successfully."}


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout_user(
    request: Request,
    response: Response,
):
    """
    Logout the current user by deleting the refresh token cookie.
    """
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        revoke_refresh_token(refresh_token)
        response.delete_cookie(key="refresh_token")
    return {"msg": "Successfully logged out."}


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

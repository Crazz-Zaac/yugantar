from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Response, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session
from datetime import timedelta

from app.models.user_model import User
from app.services.user_service import UserService
from app.core.security import create_access_token, decode_url_safe_token
from app.schemas.user_schema import TokenResponse
from app.core.config import settings
from app.core.db import get_session
from app.core import rate_limit
from app.core.refresh_tokens import (
    issue_refresh_token,
    get_user_id_for_token,
    revoke_refresh_token,
    revoke_all_refresh_tokens,
    set_refresh_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])
user_service = UserService()


def authenticate_with_rate_limit(request: Request, session: Session, email: str, password: str) -> User:
    """Password check with brute-force protection: failed attempts are
    limited per account+IP and per IP; a success resets the account counter."""
    rate_limit.check_login_allowed(request, email)
    try:
        user = user_service.authenticate_user(session=session, email=email, password=password)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            rate_limit.record_login_failure(request, email)
        raise
    rate_limit.record_login_success(request, email)
    return user


@router.post("/login", response_model=TokenResponse)
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    """
    Authenticate user and return access token.

    **Note:** Enter your EMAIL address in the 'username' field below.
    """
    user = authenticate_with_rate_limit(request, session, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expiry = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = await create_access_token(
        subject=str(
            user.id
        ),  # Fixed: was User.id (class) instead of user.id (instance)
        expires_delta=access_token_expiry,
    )

    # refresh token: opaque, stored in Redis, sent as httpOnly cookie only
    set_refresh_cookie(response, issue_refresh_token(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token="",  # Don't leak refresh token in response body
        token_type="bearer",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    """
    Refresh access token using refresh token.
    Implements refresh token rotation (OWASP best practice).
    """

    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Validate refresh token from Redis
    user_id = get_user_id_for_token(refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    from uuid import UUID
    from sqlmodel import select

    statement = select(User).where(User.id == UUID(str(user_id)))
    user = session.exec(statement).first()

    if not user or UserService.account_block_reason(user):
        # Deleted, disabled, unverified or unapproved: kill every session
        revoke_all_refresh_tokens(user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled or no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Refresh token rotation: invalidate the old one, issue a new one
    revoke_refresh_token(refresh_token)
    set_refresh_cookie(response, issue_refresh_token(user.id))

    # Create new access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = await create_access_token(
        subject=str(user.id), expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token="",  # Delivered via cookie only
        token_type="bearer",
    )


# route to verify email token only - redirects to frontend
@router.get("/verify-email")
async def verify_email_redirect(token: str):
    """
    Redirect to the frontend verification page which will call
    the actual verify API and display the result nicely.
    """
    frontend_url = f"{settings.FRONTEND_HOST}/verify-email?token={token}"
    return RedirectResponse(url=frontend_url)


# actual verification logic called by the frontend
@router.post("/verify-email", status_code=status.HTTP_200_OK)
async def verify_email_token(
    token: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Verify email using the provided token. Called by the frontend page.
    """
    try:
        token_data = decode_url_safe_token(
            token=token, max_age=86400
        )  # 24 hours expiry
        user_email = token_data.get("email")
        if not user_email:
            raise ValueError("Invalid token data")

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email verification failed: {str(e)}",
        )

    user = user_service.get_user_by_email(session=session, email=user_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.is_verified:
        return {"msg": "Email is already verified"}

    user.is_verified = True
    from datetime import datetime, timezone

    user.updated_at = datetime.now(timezone.utc)

    session.add(user)
    session.commit()
    session.refresh(user)

    if not user.is_approved:
        _notify_admins_pending_approval(session, background_tasks, user)
        return {
            "msg": "Email verified successfully. An administrator will review your registration; "
            "you'll get an email once your account is approved."
        }
    return {"msg": "Email verified successfully."}


def _notify_admins_pending_approval(session: Session, background_tasks: BackgroundTasks, user: User) -> None:
    """Tell every admin that a verified registration is waiting for approval."""
    from sqlmodel import select
    from app.models.notification_model import Notification, NotificationType
    from app.services.email_notify import send_generic_email
    from fastapi_mail import NameEmail

    name = f"{user.first_name} {user.last_name}".strip()
    admins = [
        u for u in session.exec(select(User).where(User.disabled == False)).all()  # noqa: E712
        if "admin" in {str(getattr(r, "value", r)).lower() for r in (u.access_roles or [])}
    ]
    for admin in admins:
        session.add(
            Notification(
                user_id=admin.id,
                title="New member awaiting approval",
                message=f"{name} ({user.email}) verified their email and is waiting for your approval.",
                notification_type=NotificationType.GENERAL,
            )
        )
        background_tasks.add_task(
            send_generic_email,
            [NameEmail(name=admin.first_name, email=admin.email)],
            "New member awaiting approval — Yugantar",
            f"Hello {admin.first_name},\n\n{name} ({user.email}) registered and verified their email. "
            "Please review the registration in the admin Members tab and approve or reject it.\n\n"
            "Best regards,\nYugantar System",
        )
    session.commit()

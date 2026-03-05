from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session
from datetime import timedelta
from uuid import uuid4

from app.models.user_model import User
from app.services.user_service import UserService
from app.core.security import create_access_token, decode_url_safe_token
from app.schemas.user_schema import TokenResponse
from app.core.config import settings
from app.core.db import get_session
from app.core.redis_client import redis_client

router = APIRouter(prefix="/auth", tags=["auth"])
user_service = UserService()


@router.post("/login", response_model=TokenResponse)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    """
    Authenticate user and return access token.

    **Note:** Enter your EMAIL address in the 'username' field below.
    """
    user = user_service.authenticate_user(
        session=session, email=form_data.username, password=form_data.password
    )

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

    # generate refresh token
    refresh_token = str(uuid4())
    # store refresh token in Redis with expiration
    redis_client.setex(
        f"refresh_token:{refresh_token}",  # Redis key
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        str(user.id),
    )
    # send refresh token as httpOnly cookie (not in response body)
    is_production = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        secure=is_production,
        samesite="lax",
    )

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
    old_key = f"refresh_token:{refresh_token}"
    user_id = redis_client.get(old_key)
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

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Refresh token rotation 
    # Invalidate the old refresh token
    redis_client.delete(old_key)

    # Issue a new refresh token
    new_refresh_token = str(uuid4())
    redis_client.setex(
        f"refresh_token:{new_refresh_token}",
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        str(user.id),
    )

    # Set new refresh token cookie
    is_production = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        secure=is_production,
        samesite="lax",
    )

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
async def verify_email_token(token: str, session: Session = Depends(get_session)):
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

    return {"msg": "Email verified successfully."}

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session
from datetime import timedelta

from app.models.user_model import User
from app.services.user_service import UserService
from app.core.security import create_access_token
from app.schemas.user_schema import TokenResponse
from app.core.config import settings
from app.core.db import get_session

router = APIRouter(prefix="/login", tags=["login"])
user_service = UserService()


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
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

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = await create_access_token(
        subject=str(
            user.id
        ),  # Fixed: was User.id (class) instead of user.id (instance)
        expires_delta=access_token_expires,
    )

    # Refresh token should have longer expiration
    refresh_token_expires = timedelta(days=7)  # Adjust as needed
    refresh_token = await create_access_token(
        subject=str(user.id), expires_delta=refresh_token_expires  # Fixed: was User.id
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    token: str,  # Accept refresh token as a body parameter
    session: Session = Depends(get_session),
):
    """
    Refresh access token using refresh token.
    """
    import jwt

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    # Get user from database
    from uuid import UUID
    from sqlmodel import select

    statement = select(User).where(User.id == UUID(user_id))
    user = session.exec(statement).first()

    if not user:
        raise credentials_exception

    # Create new access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = await create_access_token(
        subject=str(user.id), expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=token,  # Return the same refresh token
        token_type="bearer",
    )

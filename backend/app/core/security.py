"""
Adapted from fastapi repository: https://github.com/fastapi/full-stack-fastapi-template/blob/master/backend/app/core/security.py
"""

import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Any

from .config import settings


def create_access_token(subject: str | Any, expires_delta: timedelta) -> str:
    """
    Create a JWT access token.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a hashed password.
    """
    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""

    password_bytes = password.encode("utf-8")
    # Ensure password is a string and within bcrypt limits
    if len(password.encode("utf-8")) > 72:
        password = password[:72]  # Truncate if necessary

    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)

    # return a utf-8 string
    return hashed.decode("utf-8")

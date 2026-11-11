"""
Opaque refresh tokens stored in Redis.

  refresh_token:{token}        -> user_id     (TTL = REFRESH_TOKEN_EXPIRE_DAYS)
  user_refresh_tokens:{user}   -> set(tokens) (index used to revoke all sessions)
"""

from datetime import timedelta
from typing import Optional
from uuid import UUID, uuid4

from fastapi import Response

from app.core.config import settings
from app.core.redis_client import redis_client

COOKIE_NAME = "refresh_token"


def _ttl() -> timedelta:
    return timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def _token_key(token: str) -> str:
    return f"refresh_token:{token}"


def _user_key(user_id: UUID | str) -> str:
    return f"user_refresh_tokens:{user_id}"


def issue_refresh_token(user_id: UUID | str) -> str:
    token = str(uuid4())
    pipe = redis_client.pipeline()
    pipe.setex(_token_key(token), _ttl(), str(user_id))
    pipe.sadd(_user_key(user_id), token)
    pipe.expire(_user_key(user_id), _ttl())
    pipe.execute()
    return token


def get_user_id_for_token(token: str) -> Optional[str]:
    return redis_client.get(_token_key(token))


def revoke_refresh_token(token: str) -> None:
    user_id = redis_client.get(_token_key(token))
    pipe = redis_client.pipeline()
    pipe.delete(_token_key(token))
    if user_id:
        pipe.srem(_user_key(user_id), token)
    pipe.execute()


def revoke_all_refresh_tokens(user_id: UUID | str) -> None:
    """Log the user out of every session (disable, delete, password change)."""
    tokens = redis_client.smembers(_user_key(user_id))
    pipe = redis_client.pipeline()
    for token in tokens:
        pipe.delete(_token_key(token))
    pipe.delete(_user_key(user_id))
    pipe.execute()


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        # Secure (HTTPS-only) everywhere except local http development
        secure=settings.ENVIRONMENT != "local",
        samesite="lax",
    )

from fastapi import Depends, HTTPException, status

from app.models.user_model import User, AccessRole
from app.api.dependencies.auth import get_current_user

async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is an admin."""
    if AccessRole.ADMIN.value not in current_user.access_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges",
        )
    return current_user

# Ensure the current user is at least moderator or admin.
async def get_current_moderator_or_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is at least moderator or admin."""
    if current_user.access_roles not in [AccessRole.ADMIN.value, AccessRole.MODERATOR.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges",
        )
    return current_user
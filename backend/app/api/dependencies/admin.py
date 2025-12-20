from fastapi import Depends, HTTPException, status

from app.models.user_model import User, AccessRole
from app.api.dependencies.auth import get_current_user
from typing import Set


def require_roles(*allowed_roles: AccessRole):
    """Dependency to require specific access roles."""
    allowed_roles_set: Set[str] = {role.value for role in allowed_roles}

    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if not set(current_user.access_roles).intersection(allowed_roles_set):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )
        return current_user

    return role_checker


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
    current_user: User = Depends(require_roles(AccessRole.MODERATOR, AccessRole.ADMIN)),
) -> User:
    """Ensure the current user is at least moderator or admin."""
    print( current_user.access_roles)
    return current_user

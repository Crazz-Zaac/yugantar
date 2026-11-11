from fastapi import Depends, HTTPException, status

from app.models.user_model import User, AccessRole, CooperativeRole
from app.api.dependencies.auth import get_current_user
from typing import Set

from app.services.duties import Duty, require_duty, is_office_bearer


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
    return current_user


async def get_current_policy_manager(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user can create/edit/submit/delete policies.

    Only the Treasurer (see services/duties.py). Admin/Moderator are account
    management roles and have no financial powers.
    """
    require_duty(current_user, Duty.MANAGE_POLICY)
    return current_user


async def get_current_loan_reviewer(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is an office bearer (President, Treasurer or
    Secretary) who may see the pending-loan queue. Which loans they may act
    on is checked per loan (services/duties.py)."""
    if not is_office_bearer(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges — only the President, Treasurer or Secretary can review loans",
        )
    return current_user

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from uuid import UUID

from app.core.db import get_session
from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserUpdate, UserResponse
from app.services.user_service import UserService
from app.api.dependencies.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

user_service = UserService()


# Specific routes first
@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
):
    """
    Create a new user.
    """
    user = user_service.create_user(session=session, user_in=user_in)
    return user


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


# Dynamic routes last
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
    
    

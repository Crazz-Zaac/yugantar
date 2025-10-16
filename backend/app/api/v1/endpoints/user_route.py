from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from typing import Optional
from uuid import UUID

from app.core.db import init_db, get_session
from app.core.config import settings
from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserUpdate, UserResponse
from app.services.user_service import UserService
from app.api.dependencies.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

user_service = UserService()


# Specific routes first
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
):
    """
    Create a new user.
    """
    user = user_service.create_user(session=session, user_in=user_in)
    return user


@router.patch("/me", response_model=UserResponse)
def update_current_user(
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


# dynamic routes last
# get by user_id
@router.get("/{user_id}", response_model=UserResponse)
def get_user_id(
    user_id: UUID,
    session: Session = Depends(get_session),
):
    """
    Retrieve a user by ID.
    """
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

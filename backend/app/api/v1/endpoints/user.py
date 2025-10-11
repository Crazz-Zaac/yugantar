from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.db import init_db, get_session
from app.core.config import settings
from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserResponse
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])

user_service = UserService()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
):
    """
    Create a new user.
    """
    user = user_service.create_user(session=session, user_in=user_in)
    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    session: Session = Depends(get_session),
):
    """
    Retrieve a user by ID.
    """
    user = user_service.get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

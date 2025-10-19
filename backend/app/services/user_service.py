import uuid
from typing import Any, List, Optional
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.core.security import get_password_hash, verify_password
from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserUpdate, UserAdminUpdate


class UserService:
    """
    Service class for user-related operations.
    """

    def create_user(self, session: Session, user_in: UserCreate) -> User:
        # Create user with explicit field mapping
        user_dict = user_in.model_dump(exclude={"password"})
        user_dict["hashed_password"] = get_password_hash(user_in.password)

        user = User(**user_dict)

        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    def update_user(self, session: Session, db_user: User, user_in: UserUpdate) -> User:
        user_data = user_in.model_dump(exclude_unset=True)
        if "password" in user_data:
            user_data["hashed_password"] = get_password_hash(user_data.pop("password"))

        db_user.sqlmodel_update(user_data)
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
        return db_user

    def get_user_by_email(self, session: Session, email: str) -> Optional[User]:
        statement = select(User).where(User.email == email)
        return session.exec(statement).first()

    def get_user_by_id(self, session: Session, user_id: uuid.UUID) -> Optional[User]:
        statement = select(User).where(User.id == user_id)
        return session.exec(statement).first()

    def authenticate_user(
        self, session: Session, email: str, password: str
    ) -> Optional[User]:
        user = self.get_user_by_email(session, email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        return user

    # this method is for admin use to get all users
    def get_all_users(
        self, session: Session, skip: int = 0, limit: int = 100
    ) -> List[User]:
        """Get all user (admin only)."""
        statement = select(User).offset(skip).limit(limit)
        users = list(session.exec(statement).all())
        return users

    def admin_update_user(
        self, session: Session, user_id: uuid.UUID, user_in: UserAdminUpdate
    ) -> User:
        """Admin update of user (can change roles, disable user, etc.)"""
        user = self.get_user_by_id(session, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # update fields
        user_data = user_in.model_dump(exclude_unset=True)

        # Update roles if provided
        if "access_roles" in user_data:
            user.access_roles = user_data["access_roles"]
        if "cooperative_roles" in user_data:
            user.cooperative_roles = user_data["cooperative_roles"]
        if "disabled" in user_data:
            user.disabled = user_data["disabled"]

        from datetime import datetime, timezone

        user.updated_at = datetime.now(timezone.utc)

        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    def admin_delete_user(self, session: Session, user_id: uuid.UUID) -> bool:
        """Admin delete of user."""
        user = self.get_user_by_id(session, user_id)
        if not user:
            return False
        session.delete(user)
        session.commit()
        return True

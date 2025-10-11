import uuid
from typing import Any, List, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserUpdate


class UserService:
    """
    Service class for user-related operations.
    """    
    def create_user(self, session: Session, user_in: UserCreate) -> User:
        user = User.model_validate(
            user_in, update={"hashed_password": get_password_hash(user_in.password)}
        )
        with session.begin():
            session.add(user)
            session.refresh(user)
        return user

    def update_user(self, session: Session, db_user: User, user_in: UserUpdate) -> User:
        user_data = user_in.model_dump(exclude_unset=True)
        if "password" in user_data:
            user_data["hashed_password"] = get_password_hash(user_data.pop("password"))

        db_user.sqlmodel_update(user_data)

        with session.begin():
            session.add(db_user)
            session.refresh(db_user)
        return db_user

    def get_user_by_email(self, session: Session, email: str) -> Optional[User]:
        statement = select(User).where(User.email == email)
        return session.exec(statement).first()

    def get_user_by_id(self, session: Session, user_id: int) -> Optional[User]:
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

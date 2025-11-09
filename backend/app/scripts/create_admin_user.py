from sqlmodel import Session

from app.core.db import engine
from app.models.user_model import User, AccessRole
from app.core.security import get_password_hash
from app.core.config import settings
from app.services.user_service import UserService


def create_admin_user(email: str, password: str) -> None:
    """
    Create an admin user with the given email and password.
    """
    # get a database session
    with Session(engine) as session:
        user_service = UserService()

        existing_user = user_service.get_user_by_email(session, email)
        if existing_user:
            print("Admin user already exists.")
            return

        admin_user = User(
            first_name="System",
            last_name="Admin",
            email=email,
            hashed_password=get_password_hash(password),
            phone="+97790000000000",
            address="",
            access_roles=[AccessRole.ADMIN],
        )

        session.add(admin_user)
        session.commit()
        session.refresh(admin_user)
        print(f"Admin user created with email: {email}")


if __name__ == "__main__":
    create_admin_user(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)

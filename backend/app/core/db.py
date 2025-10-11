from sqlmodel import Session, create_engine, select
from typing import Generator

from .config import settings
from app.models.user_model import User
from app.schemas.user_schema import UserCreate
from app.services.user_service import UserService


engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# ------------------
# Dependency for FastAPI routes
# ------------------
def get_session() -> Generator[Session, None, None]:
    """Yields a new database session."""

    with Session(engine) as session:
        try:
            yield session
        finally:
            session.close()


# ------------------
# Initialize the database with the first superuser
# ------------------


def init_db(session: Session):

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
            is_active=True,
        )
        service = UserService()
        user = service.create_user(session=session, user_in=user_in)
        print("Created first superuser", user.email)
    else:
        print("Superuser already exists", user.email)

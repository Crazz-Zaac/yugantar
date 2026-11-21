from sqlmodel import Session, create_engine, select
from typing import Generator

from .config import settings
from . import utc_datetimes
from . import rls
from app.models.user_model import User
from app.schemas.user_schema import UserCreate
from app.services.user_service import UserService


# The running API connects via APP_DATABASE_URI, which is the dedicated
# RLS-subject role when configured and the owner URI otherwise (default).
engine = create_engine(str(settings.APP_DATABASE_URI))

# Every datetime loaded from the DB is UTC-aware (API sends "...Z")
utc_datetimes.register()

# Stamp each transaction with the request principal (RLS Phase 0 plumbing).
rls.register()


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
        select(User).where(User.email == settings.ADMIN_EMAIL)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.ADMIN_EMAIL,
            password=settings.ADMIN_PASSWORD,
            is_superuser=True,
            is_active=True,
        )
        service = UserService()
        user = service.create_user(session=session, user_in=user_in)
        print("Created first superuser", user.email)
    else:
        print("Superuser already exists", user.email)

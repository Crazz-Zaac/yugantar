from sqlmodel import create_engine, Session
from typing import Generator
from app.core.settings import DatabaseSettings

settings: DatabaseSettings = DatabaseSettings()

# Engine
engine = create_engine(settings.database_url, echo=True)  # echo=False in prod

# dependency for FastAPI routes
def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        try:
            yield session
        finally:
            session.close()

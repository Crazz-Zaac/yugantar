from sqlalchemy import Integer, DateTime
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Mapped, mapped_column

from datetime import datetime, timezone
from typing import Dict, Any


class BaseModel(DeclarativeBase):
    """
    Base model class for all SQLAlchemy models with:
    - Default `id` column and timestamps
    - Automatic table naming (converting CamelCase to snake_case)
    - Type hinting for columns
    - Type hinting for relationships
    """

    # __abstract__ = True
    # these are common columns for all tables
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # this is to automatically generate table names
    @property
    def __tablename__(self) -> str:
        """
        Convert class name to snake_case for table name.
        """
        return self.__class__.__name__.lower()


    # this method is to convert model instance to dictionary and vice versa
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert model instance to dictionary.
        """
        return {
            column.name: getattr(self, column.name) for column in self.__table__.columns
        }

    # this method is to create model instance from dictionary
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BaseModel":
        """
        Create model instance from dictionary.
        """
        return cls(
            **{k: v for k, v in data.items() if k in cls.__table__.columns.keys()}
        )

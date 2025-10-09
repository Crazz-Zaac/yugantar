import uuid
from sqlmodel import SQLModel, Field
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from datetime import datetime, timezone
from typing import Dict, Any, Optional


class BaseModel(SQLModel, table=False):
    """
    Base model class for all SQLModel models with:
    - Default `id` column and timestamps
    - Automatic table naming (converting CamelCase to snake_case)
    - Type hinting for columns
    """

    # __abstract__ = True
    # unique identifier for each record
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
    )

    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column_kwargs={"onupdate": lambda: datetime.now(timezone.utc)},
    )

    # this method is to convert model instance to dictionary and vice versa

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert model instance to dictionary.
        """
        return self.model_dump()

    # this method is to create model instance from dictionary
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BaseModel":
        """
        Create model instance from dictionary.
        """
        return cls(**data)

    @property
    def to_json(self) -> Dict[str, Any]:
        """
        Convert model instance to JSON serializable dictionary.
        """

        def serialize(value):
            if isinstance(value, datetime):
                return value.isoformat()
            return value

        return {key: serialize(value) for key, value in self.to_dict().items()}

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "BaseModel":
        """
        Create model instance from JSON serializable dictionary.
        """
        return cls.from_dict(data)

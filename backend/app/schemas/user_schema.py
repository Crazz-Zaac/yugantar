from sqlmodel import SQLModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone
from pydantic import field_validator, EmailStr
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy import event
from passlib.context import CryptContext
import uuid
from app.models.user_model import AccessRole, CooperativeRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ----------------------------
# User Schemas
# ----------------------------


class UserBase(SQLModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(
        ..., max_length=100
    )  # Using str instead of EmailStr for SQLModel compatibility
    phone: str = Field(..., max_length=15)
    address: str = Field(..., max_length=255)
    disabled: bool = Field(default=False)
    access_roles: List[AccessRole] = Field(
        sa_column=Column(ARRAY(String)), default_factory=lambda: [AccessRole.USER.value]
    )
    cooperative_roles: List[CooperativeRole] = Field(
        sa_column=Column(ARRAY(String)),
        default_factory=lambda: [CooperativeRole.MEMBER.value],
    )
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("email")
    def validate_email(cls, value):
        if "@" not in value:
            raise ValueError("Invalid email format")
        return value.lower()

    @field_validator("phone")
    def validate_phone(cls, value):
        if not value.replace("+", "").replace(" ", "").isdigit():
            raise ValueError("Phone number should contain only digits, spaces, and '+'")
        return value

    @property
    def full_name(self) -> str:
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"

    @property
    def is_active(self) -> bool:
        return not self.disabled

    @property
    def is_admin(self) -> bool:
        return AccessRole.ADMIN in self.access_roles

    @property
    def is_superuser(self) -> bool:
        return AccessRole.SUPERUSER in self.access_roles


# Schema for creating a new user
class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=100)

    @field_validator("password")
    def validate_password_strength(cls, value):
        # Basic password strength validation
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isalpha() for char in value):
            raise ValueError("Password must contain at least one letter")
        return value


# Schema for updating user information
class UserUpdate(SQLModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=15)
    address: Optional[str] = Field(default=None, max_length=255)
    access_roles: Optional[List[str]] = None
    cooperative_roles: Optional[List[str]] = None
    disabled: Optional[bool] = None


# Schema for internal use with hashed password
class UserDB(UserBase):
    password_hash: str = Field(
        alias="password_hash"
    )
    # Methods to set and verify password
    def set_password(self, password: str):
        self._password_hash = pwd_context.hash(password)

    def verify_password(self, password: str) -> bool:
        return pwd_context.verify(password, self._password_hash)


# Schema for returning user information (response model)
class UserResponse(UserBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    @event.listens_for(UserDB, "before_update", propagate=True)
    def update_timestamp(mapper, connection, target):
        target.updated_at = datetime.now(timezone.utc)

    class Config:
        from_attributes = True


# Schema for public user information (limited fields)
class UserPublic(UserResponse):
    class Config:
        from_attributes = True

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
    first_name: str = Field(..., min_length=3, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[EmailStr] = Field(default=None, max_length=100)
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
    def is_moderator(self) -> bool:
        return AccessRole.MODERATOR in self.access_roles


# Schema for creating a new user
class UserCreate(UserBase):
    password: str = Field(
        ..., min_length=8, max_length=72
    )  # Limit to 72 bytes for bcrypt

    @field_validator("password")
    def validate_password_strength(cls, value):
        # Ensure password doesn't exceed bcrypt's 72-byte limit
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password cannot exceed 72 bytes")

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
    email: EmailStr = Field(default=None, max_length=100)
    password: Optional[str] = Field(default=None, min_length=8, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=15)
    address: Optional[str] = Field(default=None, max_length=255)
    access_roles: Optional[List[AccessRole]] = None
    cooperative_roles: Optional[List[CooperativeRole]] = None
    disabled: Optional[bool] = None

    @field_validator("password")
    def validate_password_strength(cls, value):
        if value is None:
            return value

        # Ensure password doesn't exceed bcrypt's 72-byte limit
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password cannot exceed 72 bytes")

        # Basic password strength validation
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isalpha() for char in value):
            raise ValueError("Password must contain at least one letter")
        return value


# Schema for returning user information (response model)
class UserResponse(UserBase):
    id: uuid.UUID
    access_roles: List[AccessRole]
    cooperative_roles: List[CooperativeRole]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(SQLModel):
    access_token: str = ""
    refresh_token: str = ""
    token_type: str = "bearer"


# Schema for admin updating user information
class UserAdminUpdate(SQLModel):
    """Admin can update additional fields including roles"""

    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[EmailStr] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=15)
    address: Optional[str] = Field(default=None, max_length=255)
    access_roles: Optional[List[AccessRole]] = None
    cooperative_roles: Optional[List[CooperativeRole]] = None
    disabled: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value):
        if value is None:
            return value
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password cannot exceed 72 bytes")
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isalpha() for char in value):
            raise ValueError("Password must contain at least one letter")
        return value


# Schema for admin to list users
class UserListResponse(SQLModel):
    """Simplified user info for listing (admin view)"""

    id: uuid.UUID
    email: Optional[EmailStr]
    phone: str
    first_name: str
    middle_name: Optional[str]
    last_name: str
    access_roles: List[AccessRole]  # Fixed: was AccessRole (not a list)
    cooperative_roles: List[CooperativeRole]  # Fixed: was CooperativeRole (not a list)
    disabled: bool
    created_at: datetime

    class Config:
        from_attributes = True

    @property
    def full_name(self) -> str:
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"


# Schema for internal use with hashed password
class UserDB(UserBase):
    hashed_password: str = Field(..., alias="hashed_password")

    def set_password(self, password: str):
        self.hashed_password = pwd_context.hash(password)

    def verify_password(self, password: str) -> bool:
        return pwd_context.verify(password, self.hashed_password)


# Schema for public user information (limited fields)
class UserPublic(SQLModel):
    """Public profile - minimal information visible to other users"""

    id: uuid.UUID
    first_name: str
    last_name: Optional[str] = None  # Optionally hide last name
    joined_at: datetime
    cooperative_roles: List[CooperativeRole]

    class Config:
        from_attributes = True

    @property
    def display_name(self) -> str:
        """Show only first name and last initial for privacy"""
        if self.last_name:
            return f"{self.first_name} {self.last_name[0]}."
        return self.first_name

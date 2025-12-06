from sqlmodel import SQLModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone
from pydantic import field_validator, EmailStr
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY

from passlib.context import CryptContext
import uuid
from app.models.user_model import AccessRole, CooperativeRole, GenderEnum

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ----------------------------
# User Schemas
# ----------------------------


class UserBase(SQLModel):
    first_name: str = Field(..., min_length=3, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    gender: GenderEnum = Field(default=GenderEnum.OTHER)
    date_of_birth: Optional[datetime] = Field(default=None)

    email: EmailStr = Field(default=None, max_length=100)

    phone: str = Field(..., max_length=15)
    address: str = Field(..., max_length=255)
    
    is_verified: bool = Field(default=False)
    
    disabled: bool = Field(default=False)
    # user roles and cooperative roles will be assigned by the system/admin after registration
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
        if not any(char.isupper() for char in value):
            raise ValueError("Password must contain at least one uppercase letter")
        return value


# Schema for updating user information
class UserUpdate(SQLModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    gender: GenderEnum = Field(default=GenderEnum.OTHER)
    date_of_birth: Optional[datetime] = Field(default=None)
    email: EmailStr = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=15)
    address: Optional[str] = Field(default=None, max_length=255)


class UserPasswordChange(SQLModel):
    current_password: str = Field(..., min_length=8, max_length=72)
    new_password: str = Field(..., min_length=8, max_length=72)

    @field_validator("new_password")
    def validate_new_password_strength(cls, value):
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


# Schema for admin updating user roles and status
class AdminAssignUserRoles(SQLModel):
    """Admin can update additional fields including roles"""

    access_roles: Optional[List[AccessRole]] = None
    cooperative_roles: Optional[List[CooperativeRole]] = None
    
    disabled: Optional[bool] = None


# Schema for admin to list users
class UserListResponse(SQLModel):
    """Simplified user info for listing (admin view)"""

    id: uuid.UUID

    first_name: str
    middle_name: Optional[str]
    last_name: str
    gender: GenderEnum
    date_of_birth: Optional[datetime]

    email: Optional[EmailStr]
    phone: str

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
    middle_name: Optional[str] = None
    last_name: Optional[str] = None  # Optionally hide last name
    gender: GenderEnum

    access_roles: List[AccessRole]
    cooperative_roles: List[CooperativeRole]

    joined_at: datetime

    class Config:
        from_attributes = True

    @property
    def display_name(self) -> str:
        """Show only first name and last initial for privacy"""
        if self.last_name:
            return f"{self.first_name} {self.last_name[0]}."
        return self.first_name


class LoginSuccess(SQLModel):
    token: TokenResponse
    user: UserResponse
    

class LoginRequest(SQLModel):
    email: EmailStr
    password: str
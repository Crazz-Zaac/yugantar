from sqlmodel import SQLModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone
import uuid
from pydantic import field_validator


class Role(str, Enum):
    SUPERUSER = "superuser"
    ADMIN = "admin"
    MEMBER = "member"


class CooperativeRole(str, Enum):
    SECRETARY = "secretary"
    TREASURER = "treasurer"
    PRESIDENT = "president"
    MEMBER = "member"


# ----------------------------
# User Schemas
# ----------------------------


class UserBase(SQLModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., max_length=100)  # Using str instead of EmailStr for SQLModel compatibility
    phone: str = Field(..., max_length=15)
    address: str = Field(..., max_length=255)
    disabled: bool = Field(default=False)
    access_roles: List[Role] = Field(default=[Role.MEMBER])
    cooperative_roles: List[CooperativeRole] = Field(default=[CooperativeRole.MEMBER])
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
        return Role.ADMIN in self.access_roles or Role.SUPERUSER in self.access_roles


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=100)
    password_repeat: str = Field(..., min_length=8, max_length=100)

    @field_validator("password_repeat")
    def validate_passwords_match(cls, value, info):
        password = info.data.get("password")
        if password and value != password:
            raise ValueError("Passwords do not match")
        return value

    @field_validator("password")
    def validate_password_strength(cls, value):
        # Basic password strength validation
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isalpha() for char in value):
            raise ValueError("Password must contain at least one letter")
        return value

class UserUpdate(SQLModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=15)
    address: Optional[str] = Field(default=None, max_length=255)
    access_roles: Optional[List[Role]] = None
    cooperative_roles: Optional[List[CooperativeRole]] = None
    disabled: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=100)

    @field_validator("email")
    def validate_email(cls, value):
        if value and "@" not in value:
            raise ValueError("Invalid email format")
        return value.lower() if value else value

class UserResponse(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserDB(UserBase, table=False):
    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str  # Store hashed password, not plain text
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Simplified user response without sensitive data
class UserPublic(SQLModel):
    id: int
    first_name: str
    middle_name: Optional[str]
    last_name: str
    email: str
    phone: str
    access_roles: List[Role]
    cooperative_roles: List[CooperativeRole]
    joined_at: datetime
    disabled: bool

    class Config:
        from_attributes = True
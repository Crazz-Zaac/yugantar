from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Dict
from enum import Enum
from datetime import datetime, timezone
import uuid


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


class UserBase(BaseModel):
    user_id: int = Field(default_factory=lambda: int(uuid.uuid4()))
    first_name: str = Field(..., min_length=3, max_length=100)
    middle_name: Optional[str] = Field(None, min_length=3, max_length=100)
    last_name: str = Field(..., min_length=3, max_length=100)
    email: EmailStr
    phone: str = Field(max_length=15)
    address: str = Field(max_length=255)
    disabled: bool = Field(default=False)
    access_roles: List[Role] = Field(default=[Role.MEMBER])
    cooperative_roles: List[CooperativeRole] = Field(default=[CooperativeRole.MEMBER])
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCreate(UserBase):
    user_id: int = Field(default_factory=lambda: int(uuid.uuid4()))
    full_name: str = Field(..., min_length=3, max_length=100)
    middle_name: Optional[str] = Field(None, min_length=3, max_length=100)
    last_name: str = Field(..., min_length=3, max_length=100)
    email: EmailStr
    phone: str = Field(..., max_length=15)
    address: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=100)
    password_repeat: str = Field(..., min_length=8, max_length=100)
    access_roles: List[Role] = Field(default=[Role.MEMBER])
    cooperative_roles: List[CooperativeRole] = Field(default=[CooperativeRole.MEMBER])


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=3, max_length=100)
    last_name: Optional[str] = Field(None, min_length=3, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=15)
    address: Optional[str] = Field(None, max_length=255)
    access_roles: Optional[List[Role]] = None
    cooperative_roles: Optional[List[CooperativeRole]] = None
    disabled: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, max_length=100)
    password_repeat: Optional[str] = Field(None, min_length=8, max_length=100)

class UserOut(UserBase):
    user_id: int
    full_name: str
    middle_name: Optional[str]
    last_name: str
    email: EmailStr
    phone: str
    address: str
    disabled: bool
    access_roles: List[Role]
    cooperative_roles: List[CooperativeRole]
    joined_at: datetime

    class Config:
        orm_mode = True
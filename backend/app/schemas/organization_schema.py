"""Read/update schemas for the cooperative's official details."""

from typing import Optional

from pydantic import BaseModel, field_validator


class OrganizationRead(BaseModel):
    name: str
    email: str
    phone: str
    address: str
    website: str


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("The organisation name can't be empty.")
        return v.strip() if v is not None else v

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: Optional[str]) -> Optional[str]:
        v = v.strip() if v is not None else v
        if v:  # allow clearing, but if given it must look like an address
            if "@" not in v or " " in v:
                raise ValueError("Enter a valid email address.")
        return v

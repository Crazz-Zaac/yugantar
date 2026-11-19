"""
The cooperative's official details: name, contact email, phone, address, website.

A single row the Admin edits from the Organization tab. Outgoing emails use it
for the signature block and the contact address — the stored contact email is
what appears in every email, whoever the message is from (Treasurer, Secretary,
Administration). The signer's *name and role* come from the office bearer the
message is from; the email and organisation name come from here.
"""

from sqlmodel import Field

from app.models.base import BaseModel


class OrganizationSettings(BaseModel, table=True):
    __tablename__ = "organization_settings"
    __table_args__ = {"extend_existing": True}

    name: str = Field(default="Yugantar Cooperative", max_length=200)
    email: str = Field(default="", max_length=255)  # the official contact address
    phone: str = Field(default="", max_length=50)
    address: str = Field(default="", max_length=255)
    website: str = Field(default="", max_length=255)

"""Read and update the single OrganizationSettings row."""

from sqlmodel import Session, select

from app.core.config import settings
from app.models.organization_model import OrganizationSettings
from app.schemas.organization_schema import OrganizationUpdate


def get_org(session: Session) -> OrganizationSettings:
    """The organisation row, created with sensible defaults on first use."""
    org = session.exec(select(OrganizationSettings)).first()
    if org is None:
        org = OrganizationSettings(email=str(settings.EMAILS_FROM_EMAIL or ""))
        session.add(org)
        session.commit()
        session.refresh(org)
    return org


def update_org(session: Session, data: OrganizationUpdate) -> OrganizationSettings:
    org = get_org(session)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(org, key, value)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org

"""The cooperative's official details (see services/organization_service.py).

Any member may read them; only an Admin may change them.
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.dependencies.admin import get_current_admin
from app.api.dependencies.auth import get_current_user
from app.core.db import get_session
from app.models.user_model import User
from app.schemas.organization_schema import OrganizationRead, OrganizationUpdate
from app.services.organization_service import get_org, update_org

router = APIRouter(prefix="/organization", tags=["organization"])


@router.get("", response_model=OrganizationRead)
def read_organization(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return get_org(session)


@router.put("", response_model=OrganizationRead)
def edit_organization(
    data: OrganizationUpdate,
    _admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    return update_org(session, data)

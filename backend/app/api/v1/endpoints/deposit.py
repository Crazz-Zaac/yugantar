from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlmodel import Session
from uuid import UUID

from app.core.db import get_session
from app.schemas.deposit_schema import (
    DepositCreate,
    DepositUserUpdate,
    DepositResponse,
    DepositModeratorUpdate,
    DepositVerificationStatus,
)
from app.services.deposit_service import DepositService
from app.services.smart_deposit_service import SmartDepositService
from app.schemas.smart_deposit_schema import (
    DepositPreviewRequest,
    DepositPreviewResponse,
    SmartDepositCreate,
    SmartDepositResponse,
)
from app.api.dependencies.auth import get_current_active_user
from app.models.user_model import User


router = APIRouter(prefix="/deposits", tags=["deposits"])
deposit_service = DepositService()
smart_deposit_service = SmartDepositService()


@router.post(
    "/deposit",
    response_model=DepositResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_deposit(
    deposit_in: DepositCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Create a new deposit.
    """
    new_deposit = deposit_service.create_deposit(
        session=session,
        deposit_in=deposit_in,
        user_id=current_user.id,
    )
    return new_deposit


@router.put(
    "/deposit/{deposit_id}/me",
    response_model=DepositResponse,
)
def update_deposit(
    deposit_id: UUID,
    deposit_in: DepositUserUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Update an existing deposit.
    """
    updated_deposit = deposit_service.user_update_deposit(
        session=session,
        deposit_id=deposit_id,
        deposit_in=deposit_in,
        user_id=current_user.id,
    )
    return updated_deposit


@router.put(
    "/deposit/{deposit_id}/moderator",
    response_model=DepositResponse,
)
def moderator_update_deposit(
    deposit_id: UUID,
    deposit_in: DepositModeratorUpdate,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Moderator update for an existing deposit.
    """
    updated_deposit = deposit_service.verify_deposit(
        session=session,
        deposit_id=deposit_id,
        deposit_in=deposit_in,
        current_user=current_user,
    )
    return updated_deposit


@router.get(
    "/deposit/{deposit_id}",
    response_model=DepositResponse,
)
def get_deposit(
    deposit_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Retrieve a deposit by its ID.
    """
    deposit = deposit_service.get_deposit(
        session=session,
        deposit_id=deposit_id,
    )
    return deposit


@router.delete(
    "/deposit/{deposit_id}/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_my_deposit(
    deposit_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    deposit_service.user_delete_deposit(
        session=session,
        deposit_id=deposit_id,
        user_id=current_user.id,
    )
    return None


@router.delete(
    "/deposit/{deposit_id}/moderator",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_deposit_by_moderator(
    deposit_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    deposit_service.moderator_delete_deposit(
        session=session,
        deposit_id=deposit_id,
        current_user=current_user,
    )
    return None


# ──────────────────────────────────────────────
# Smart Deposit endpoints
# ──────────────────────────────────────────────


@router.post(
    "/preview",
    response_model=DepositPreviewResponse,
)
def preview_deposit(
    req: DepositPreviewRequest,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Compute the deposit breakdown: charge deduction, late fine,
    excess amount, and suggested split allocations.
    No database writes — purely a preview.
    """
    return smart_deposit_service.preview(
        session=session,
        req=req,
        user_id=current_user.id,
    )


@router.post(
    "/smart",
    response_model=SmartDepositResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_smart_deposit(
    req: SmartDepositCreate,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Create a deposit with smart-split allocations.
    Creates the deposit, fine (if late), and loan payments (if allocated)
    in a single transaction.
    """
    return smart_deposit_service.execute(
        session=session,
        req=req,
        user_id=current_user.id,
    )

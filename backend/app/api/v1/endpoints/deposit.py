from fastapi import (
    APIRouter,
    Depends,
    Request,
    HTTPException,
    status,
    Query,
    BackgroundTasks,
)
from sqlmodel import Session, select
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
from app.models.user_model import User, CooperativeRole
from app.models.notification_model import Notification, NotificationType
from app.services.email_notify import send_generic_email
from app.services.visibility import can_view_deposit
from app.services.duties import Duty, responsible_users
from app.models.deposit_model import DepositType
from datetime import date
from typing import Optional
from fastapi_mail import NameEmail


router = APIRouter(prefix="/deposits", tags=["deposits"])
deposit_service = DepositService()
smart_deposit_service = SmartDepositService()


def _notify_treasurers_new_deposit(
    session: Session,
    background_tasks: BackgroundTasks,
    depositor: User,
    amount_rupees: str,
) -> None:
    """Notify whoever verifies this deposit (the Treasurers, or the Secretary
    if the depositor is the Treasurer)."""
    depositor_name = f"{depositor.first_name} {depositor.last_name}".strip()
    treasurers = responsible_users(session, Duty.VERIFY_DEPOSIT, depositor)

    for treasurer in treasurers:
        session.add(
            Notification(
                user_id=treasurer.id,
                title="New Deposit Requires Verification",
                message=(
                    f"{depositor_name} submitted a deposit of Rs. {amount_rupees}. "
                    "Please review and verify/reject it."
                ),
                notification_type=NotificationType.DEPOSIT_SUBMITTED,
            )
        )

        background_tasks.add_task(
            send_generic_email,
            [NameEmail(name=treasurer.first_name, email=treasurer.email)],
            "Deposit Submitted — Verification Required",
            f"Hello {treasurer.first_name},\n\n"
            f"{depositor_name} submitted a deposit of Rs. {amount_rupees}.\n"
            "Please review it in the Deposit Review tab and mark it as verified or rejected.\n\n"
            "Best regards,\nYugantar System",
        )

    session.commit()


def _notify_depositor_review_outcome(
    session: Session,
    background_tasks: BackgroundTasks,
    deposit,
    reviewer_name: str,
) -> None:
    depositor = session.get(User, deposit.user_id)
    if not depositor:
        return

    is_verified = deposit.verification_status == DepositVerificationStatus.VERIFIED
    amount_rupees = f"{deposit.amount_rupees:,.2f}"
    action_label = "verified" if is_verified else "rejected"

    session.add(
        Notification(
            user_id=depositor.id,
            title=f"Deposit {action_label.title()}",
            message=(
                f"Your deposit of Rs. {amount_rupees} has been {action_label} "
                f"by {reviewer_name}."
            ),
            notification_type=(
                NotificationType.DEPOSIT_VERIFIED
                if is_verified
                else NotificationType.DEPOSIT_REJECTED
            ),
        )
    )
    session.commit()

    background_tasks.add_task(
        send_generic_email,
        [NameEmail(name=depositor.first_name, email=depositor.email)],
        f"Deposit {action_label.title()} — Yugantar",
        f"Hello {depositor.first_name},\n\n"
        f"Your deposit of Rs. {amount_rupees} has been {action_label} "
        f"by {reviewer_name}.\n\n"
        "Best regards,\nYugantar System",
    )


@router.post(
    "/deposit",
    response_model=DepositResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_deposit(
    deposit_in: DepositCreate,
    request: Request,
    background_tasks: BackgroundTasks,
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

    _notify_treasurers_new_deposit(
        session=session,
        background_tasks=background_tasks,
        depositor=current_user,
        amount_rupees=f"{new_deposit.amount_rupees:,.2f}",
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
    background_tasks: BackgroundTasks,
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
    reviewer_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_depositor_review_outcome(
        session=session,
        background_tasks=background_tasks,
        deposit=updated_deposit,
        reviewer_name=reviewer_name,
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

    Verified deposits are visible to every member; pending/rejected ones only
    to the depositor and office bearers (others get 404).
    """
    deposit = deposit_service.get_deposit(
        session=session,
        deposit_id=deposit_id,
    )
    if not can_view_deposit(current_user, deposit):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deposit not found")
    return deposit


@router.get(
    "/me",
    response_model=list[DepositResponse],
)
def get_my_deposits(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    return deposit_service.list_my_deposits(
        session=session,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/community",
    response_model=list[DepositResponse],
)
def get_community_deposits(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    member: Optional[str] = Query(None, max_length=100, description="Member name contains"),
    date_from: Optional[date] = Query(None, description="From this Nepal date (inclusive)"),
    date_to: Optional[date] = Query(None, description="To this Nepal date (inclusive)"),
    deposit_type: Optional[DepositType] = Query(None, alias="type"),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Verified deposits across the cooperative, newest first, with filters."""
    return deposit_service.list_community_deposits(
        session=session,
        skip=skip,
        limit=limit,
        member=member,
        date_from=date_from,
        date_to=date_to,
        deposit_type=deposit_type,
    )


@router.get(
    "/history",
    response_model=list[DepositResponse],
)
def get_my_deposit_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    return deposit_service.list_deposit_history(
        session=session,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/review/pending",
    response_model=list[DepositResponse],
)
def get_pending_review_deposits(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    return deposit_service.list_pending_review_deposits(
        session=session,
        current_user=current_user,
        skip=skip,
        limit=limit,
    )


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


# Smart Deposit endpoints
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
    Compute the deposit breakdown: late fine,
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Create a deposit with smart-split allocations.
    Creates the deposit, fine (if late), and loan payments (if allocated)
    in a single transaction.
    """
    result = smart_deposit_service.execute(
        session=session,
        req=req,
        user_id=current_user.id,
    )

    if result.deposit_id:
        _notify_treasurers_new_deposit(
            session=session,
            background_tasks=background_tasks,
            depositor=current_user,
            amount_rupees=f"{result.deposit_amount_paisa / 100:,.2f}",
        )

    return result

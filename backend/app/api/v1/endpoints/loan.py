from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status, BackgroundTasks
from sqlmodel import Session, select
from uuid import UUID

from app.core.db import get_session
from app.schemas.loan_schema import (
    LoanApplicationCreate,
    LoanFundVerification,
    LoanApprovalAction,
    LoanRejectAction,
    LoanResponse,
    LoanListResponse,
    LoanCalculatorRequest,
    LoanCalculatorResponse,
)
from app.services.loan_service import LoanService
from app.api.dependencies.auth import get_current_active_user
from app.api.dependencies.admin import (
    get_current_policy_manager,
    get_current_loan_reviewer,
)
from app.models.user_model import User, CooperativeRole
from app.models.loan_model import LoanStatus
from app.models.notification_model import Notification, NotificationType
from app.services.email_notify import send_generic_email
from fastapi_mail import NameEmail


router = APIRouter(prefix="/loans", tags=["loans"])
loan_service = LoanService()


def _notify_treasurers_new_loan(
    session: Session,
    background_tasks: BackgroundTasks,
    loan_id: UUID,
    applicant_name: str,
    amount_rupees: str,
    purpose: str,
):
    """Notify all Treasurers that a new loan application was submitted."""
    all_users = session.exec(select(User)).all()
    treasurers = [
        u
        for u in all_users
        if CooperativeRole.TREASURER.value in (u.cooperative_roles or [])
    ]

    for treasurer in treasurers:
        notif = Notification(
            user_id=treasurer.id,
            title="New Loan Application",
            message=(
                f"{applicant_name} has applied for a loan of Rs. {amount_rupees} "
                f"for '{purpose}'. Please verify fund availability."
            ),
            notification_type=NotificationType.LOAN_APPLICATION,
            loan_id=loan_id,
        )
        session.add(notif)

        background_tasks.add_task(
            send_generic_email,
            [NameEmail(name=treasurer.first_name, email=treasurer.email)],
            "New Loan Application — Yugantar",
            f"Hello {treasurer.first_name},\n\n"
            f"{applicant_name} has submitted a loan application.\n\n"
            f"Amount: Rs. {amount_rupees}\n"
            f"Purpose: {purpose}\n\n"
            f"Please log in to verify fund availability.\n\n"
            f"Best regards,\nYugantar System",
        )

    session.commit()


def _notify_presidents_loan_verified(
    session: Session,
    background_tasks: BackgroundTasks,
    loan_id: UUID,
    applicant_name: str,
    amount_rupees: str,
    treasurer_name: str,
):
    """Notify all Presidents that a treasurer has verified funds for a loan."""
    all_users = session.exec(select(User)).all()
    presidents = [
        u
        for u in all_users
        if CooperativeRole.PRESIDENT.value in (u.cooperative_roles or [])
    ]

    for president in presidents:
        notif = Notification(
            user_id=president.id,
            title="Loan Funds Verified — Awaiting Approval",
            message=(
                f"Treasurer {treasurer_name} has verified fund availability for "
                f"{applicant_name}'s loan of Rs. {amount_rupees}. "
                f"Please review and approve or reject."
            ),
            notification_type=NotificationType.LOAN_FUND_VERIFIED,
            loan_id=loan_id,
        )
        session.add(notif)

        background_tasks.add_task(
            send_generic_email,
            [NameEmail(name=president.first_name, email=president.email)],
            "Loan Awaiting Your Approval — Yugantar",
            f"Hello {president.first_name},\n\n"
            f"Treasurer {treasurer_name} has verified fund availability for a loan.\n\n"
            f"Applicant: {applicant_name}\n"
            f"Amount: Rs. {amount_rupees}\n\n"
            f"Please log in to approve or reject.\n\n"
            f"Best regards,\nYugantar System",
        )

    session.commit()


def _notify_applicant_decision(
    session: Session,
    background_tasks: BackgroundTasks,
    loan,
    action: str,
    decider_name: str,
    rejection_reason: str | None = None,
):
    """Notify the loan applicant about the president's decision."""
    applicant = session.get(User, loan.user_id)
    if not applicant:
        return

    is_approved = action == "approved"
    amount_rupees = f"{loan.principal_paisa / 100:,.2f}"

    # If approved, include treasurer contact info
    extra_msg = ""
    if is_approved:
        # Find treasurers for contact info
        all_users = session.exec(select(User)).all()
        treasurers = [
            u
            for u in all_users
            if CooperativeRole.TREASURER.value in (u.cooperative_roles or [])
        ]
        if treasurers:
            t = treasurers[0]
            extra_msg = (
                f"\n\nTo collect your funds, please contact the Treasurer:\n"
                f"Name: {t.first_name} {t.last_name}\n"
                f"Phone: {t.phone}\n"
                f"Email: {t.email}"
            )

    message = (
        f"President {decider_name} has {action} your loan application "
        f"of Rs. {amount_rupees}."
    )
    if rejection_reason:
        message += f"\nReason: {rejection_reason}"
    message += extra_msg

    notif = Notification(
        user_id=applicant.id,
        title=f"Loan Application {'Approved' if is_approved else 'Rejected'}",
        message=message,
        notification_type=(
            NotificationType.LOAN_APPROVED
            if is_approved
            else NotificationType.LOAN_REJECTED
        ),
        loan_id=loan.id,
    )
    session.add(notif)
    session.commit()

    email_body = (
        f"Hello {applicant.first_name},\n\n"
        f"Your loan application of Rs. {amount_rupees} has been {action} "
        f"by President {decider_name}."
    )
    if rejection_reason:
        email_body += f"\n\nReason: {rejection_reason}"
    email_body += extra_msg
    email_body += "\n\nBest regards,\nYugantar System"

    background_tasks.add_task(
        send_generic_email,
        [NameEmail(name=applicant.first_name, email=applicant.email)],
        f"Loan Application {action.title()} — Yugantar",
        email_body,
    )


# Loan Endpoints

@router.post(
    "/apply",
    response_model=LoanResponse,
    status_code=status.HTTP_201_CREATED,
)
def apply_for_loan(
    application: LoanApplicationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    A member applies for a loan under an active policy.
    Notifies all Treasurers.
    """
    loan_response = loan_service.apply_for_loan(
        session=session,
        application=application,
        user=current_user,
    )

    applicant_name = f"{current_user.first_name} {current_user.last_name}".strip()
    amount_str = f"{loan_response.principal_rupees:,.2f}"

    _notify_treasurers_new_loan(
        session,
        background_tasks,
        loan_id=loan_response.id,
        applicant_name=applicant_name,
        amount_rupees=amount_str,
        purpose=application.purpose,
    )

    return loan_response


@router.get(
    "/me",
    response_model=LoanListResponse,
)
def get_my_loans(
    status_filter: Optional[LoanStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Get all loans for the authenticated user."""
    loans, total = loan_service.get_my_loans(
        session=session,
        user_id=current_user.id,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )
    return LoanListResponse(loans=loans, total=total)


@router.get(
    "/community",
    response_model=LoanListResponse,
)
def get_community_loans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """View community lending activity (approved/active/paid loans)."""
    loans, total = loan_service.get_community_loans(
        session=session,
        skip=skip,
        limit=limit,
    )
    return LoanListResponse(loans=loans, total=total)


@router.get(
    "/pending",
    response_model=LoanListResponse,
)
def get_pending_loans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_loan_reviewer),
    session: Session = Depends(get_session),
):
    """List all pending loan applications. Treasurer/President/Moderator/Admin."""
    loans, total = loan_service.get_pending_loans(
        session=session,
        skip=skip,
        limit=limit,
    )
    return LoanListResponse(loans=loans, total=total)


@router.get(
    "/{loan_id}",
    response_model=LoanResponse,
)
def get_loan(
    loan_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Get a specific loan by ID."""
    return loan_service.get_loan(session=session, loan_id=loan_id)


@router.post(
    "/{loan_id}/verify-funds",
    response_model=LoanResponse,
    status_code=status.HTTP_200_OK,
)
def verify_loan_funds(
    loan_id: UUID,
    body: LoanFundVerification,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """
    Treasurer verifies that the cooperative has sufficient funds for this loan.
    Notifies all Presidents for approval.
    """
    # Ensure the user is actually a treasurer
    if CooperativeRole.TREASURER.value not in (current_user.cooperative_roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Treasurer can verify funds.",
        )

    loan = loan_service.verify_funds(
        session=session,
        loan_id=loan_id,
        verified_by=current_user,
    )

    # Get applicant name
    applicant = session.get(User, loan.user_id)
    applicant_name = (
        f"{applicant.first_name} {applicant.last_name}".strip()
        if applicant
        else "Unknown"
    )
    treasurer_name = f"{current_user.first_name} {current_user.last_name}".strip()
    amount_str = f"{loan.principal_paisa / 100:,.2f}"

    _notify_presidents_loan_verified(
        session,
        background_tasks,
        loan_id=loan.id,
        applicant_name=applicant_name,
        amount_rupees=amount_str,
        treasurer_name=treasurer_name,
    )

    return loan_service.get_loan(session=session, loan_id=loan.id)


@router.post(
    "/{loan_id}/approve",
    response_model=LoanResponse,
    status_code=status.HTTP_200_OK,
)
def approve_loan(
    loan_id: UUID,
    body: LoanApprovalAction,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    President approves a pending loan (funds must already be verified).
    Notifies the applicant with treasurer contact info.
    """
    if CooperativeRole.PRESIDENT.value not in (current_user.cooperative_roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the President can approve loans.",
        )

    loan = loan_service.approve_loan(
        session=session,
        loan_id=loan_id,
        approved_by=current_user,
    )

    president_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_applicant_decision(
        session,
        background_tasks,
        loan=loan,
        action="approved",
        decider_name=president_name,
    )

    return loan_service.get_loan(session=session, loan_id=loan.id)


@router.post(
    "/{loan_id}/reject",
    response_model=LoanResponse,
    status_code=status.HTTP_200_OK,
)
def reject_loan(
    loan_id: UUID,
    body: LoanRejectAction,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    President rejects a pending loan.
    Notifies the applicant with the reason.
    """
    if CooperativeRole.PRESIDENT.value not in (current_user.cooperative_roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the President can reject loans.",
        )

    loan = loan_service.reject_loan(
        session=session,
        loan_id=loan_id,
        rejected_by=current_user,
        reason=body.rejection_reason,
    )

    president_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_applicant_decision(
        session,
        background_tasks,
        loan=loan,
        action="rejected",
        decider_name=president_name,
        rejection_reason=body.rejection_reason,
    )

    return loan_service.get_loan(session=session, loan_id=loan.id)


@router.post(
    "/calculator",
    response_model=LoanCalculatorResponse,
)
def calculate_loan(
    req: LoanCalculatorRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Calculate loan repayment estimates.
    Simple interest based. Any authenticated user can use this.
    """
    return LoanService.calculate_loan(req)

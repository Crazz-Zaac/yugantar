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
    GuaranteeDecision,
)
from app.services.loan_service import LoanService
from app.api.dependencies.auth import get_current_active_user
from app.api.dependencies.admin import get_current_loan_reviewer
from app.services.duties import Duty, require_duty, responsible_users, is_office_bearer
from app.services.loan_agreement import generate_and_store as generate_agreement
from app.core.document_storage import document_storage
from fastapi.responses import FileResponse
from datetime import date
from app.models.user_model import User, CooperativeRole
from app.models.loan_model import Loan, LoanStatus
from app.services.visibility import can_view_loan
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
    """Notify whoever verifies funds for this loan (the Treasurers, or the
    Secretary if the applicant is the Treasurer)."""
    loan = session.get(Loan, loan_id)
    treasurers = responsible_users(
        session, Duty.VERIFY_LOAN_FUNDS, loan.user if loan else None
    )

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
    """Notify whoever approves this loan (the Presidents, or the Secretary
    if the applicant is the President) that funds were verified."""
    loan = session.get(Loan, loan_id)
    presidents = responsible_users(session, Duty.DECIDE_LOAN, loan.user if loan else None)

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


def _get_applicant(session: Session, loan_id: UUID) -> User:
    loan = session.get(Loan, loan_id)
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found.")
    return loan.user


def _notify_user(session: Session, background_tasks: BackgroundTasks, user: User, title: str, message: str,
                 ntype: NotificationType, loan_id: UUID) -> None:
    session.add(Notification(user_id=user.id, title=title, message=message, notification_type=ntype, loan_id=loan_id))
    session.commit()
    background_tasks.add_task(
        send_generic_email,
        [NameEmail(name=user.first_name, email=user.email)],
        f"{title} — Yugantar",
        f"Hello {user.first_name},\n\n{message}\n\nPlease log in to the Yugantar portal for details.\n\nBest regards,\nYugantar System",
    )


def _require_guarantor_cleared(loan: Loan, user: User) -> None:
    """No review while the guarantor hasn't signed; the guarantor never reviews."""
    if loan.guarantor_status == "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Waiting for the guarantor to sign before this loan can be reviewed.",
        )
    if loan.guarantor_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are this loan's guarantor, so another office bearer has to review it.",
        )


def _require_loan_decider(session: Session, loan_id: UUID, user: User) -> None:
    """President (Secretary for the President's own loan), never the
    applicant, and never the same person who verified the funds."""
    loan = session.get(Loan, loan_id)
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found.")
    require_duty(user, Duty.DECIDE_LOAN, loan.user)
    _require_guarantor_cleared(loan, user)
    if loan.fund_verified_by and loan.fund_verified_by == user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You verified the funds for this loan; a different person has to approve or reject it.",
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

    if loan_response.guarantor_user_id:
        # The guarantor signs first; the Treasurers are told once they have
        guarantor = session.get(User, loan_response.guarantor_user_id)
        _notify_user(
            session, background_tasks, guarantor,
            "Guarantee request",
            f"{applicant_name} has asked you to be the guarantor for a loan of Rs. {amount_str} "
            f"({application.purpose}). Please review and sign, or decline.",
            NotificationType.LOAN_APPLICATION, loan_response.id,
        )
    else:
        _notify_treasurers_new_loan(
            session,
            background_tasks,
            loan_id=loan_response.id,
            applicant_name=applicant_name,
            amount_rupees=amount_str,
            purpose=application.purpose,
        )

    return loan_response


@router.get("/guarantee-requests", response_model=list[LoanResponse])
def my_guarantee_requests(
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Loans waiting for my signature as guarantor."""
    return loan_service.guarantee_requests(session, current_user)


@router.post("/{loan_id}/guarantee", response_model=LoanResponse)
def respond_to_guarantee(
    loan_id: UUID,
    body: GuaranteeDecision,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The guarantor signs (name and date are recorded) or declines.
    Signing sends the application on to the Treasurer; declining closes it."""
    loan = loan_service.respond_to_guarantee(session, loan_id, current_user, body.accept, body.note)
    applicant = session.get(User, loan.user_id)
    applicant_name = f"{applicant.first_name} {applicant.last_name}".strip() if applicant else "A member"
    guarantor_name = f"{current_user.first_name} {current_user.last_name}".strip()
    amount_str = f"{loan.principal_paisa / 100:,.2f}"
    if body.accept:
        if applicant:
            _notify_user(session, background_tasks, applicant, "Your guarantor signed",
                         f"{guarantor_name} signed as guarantor for your loan of Rs. {amount_str}. "
                         "It now goes to the Treasurer.", NotificationType.LOAN_APPLICATION, loan.id)
        _notify_treasurers_new_loan(session, background_tasks, loan_id=loan.id, applicant_name=applicant_name,
                                    amount_rupees=amount_str, purpose=loan.purpose or "Loan")
    elif applicant:
        _notify_user(session, background_tasks, applicant, "Your guarantor declined",
                     f"{guarantor_name} declined to be the guarantor for your loan of Rs. {amount_str}"
                     + (f": {loan.guarantor_note}" if loan.guarantor_note else ".")
                     + " The application was closed; you can apply again with another guarantor.",
                     NotificationType.LOAN_REJECTED, loan.id)
    return loan_service.get_loan(session=session, loan_id=loan.id)


@router.get("/{loan_id}/agreement")
def download_agreement(
    loan_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The loan agreement PDF. Applicant, guarantor and office bearers only."""
    loan = session.get(Loan, loan_id)
    allowed = loan and (
        current_user.id in (loan.user_id, loan.guarantor_user_id) or is_office_bearer(current_user)
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found.")
    path = document_storage.path_for(loan.agreement_file_key) if loan.agreement_file_key else None
    if not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The agreement is created when the loan is approved.")
    reference = str(loan.id).split("-")[0].upper()
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"loan-agreement-LN-{reference}.pdf",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


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
    member: Optional[str] = Query(None, max_length=100, description="Member name contains"),
    status_filter: Optional[LoanStatus] = Query(None, alias="status", description="approved, active or paid"),
    purpose: Optional[str] = Query(None, max_length=100),
    date_from: Optional[date] = Query(None, description="Approved on/after this Nepal date"),
    date_to: Optional[date] = Query(None, description="Approved on/before this Nepal date"),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """View community lending activity (approved/active/paid loans), with filters."""
    loans, total = loan_service.get_community_loans(
        session=session,
        skip=skip,
        limit=limit,
        member=member,
        status_filter=status_filter,
        purpose=purpose,
        date_from=date_from,
        date_to=date_to,
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
        viewer=current_user,
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
    """Get a specific loan by ID.

    Approved/active/paid loans are visible to every member (closed-group
    transparency); pending/rejected ones only to the applicant and office
    bearers. Hidden loans return 404.
    """
    loan = session.get(Loan, loan_id)
    if not loan or not can_view_loan(current_user, loan):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found.")
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
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Treasurer verifies that the cooperative has sufficient funds for this loan
    (Secretary if it's the Treasurer's own loan; never your own).
    Notifies whoever must approve it.
    """
    applicant = _get_applicant(session, loan_id)
    require_duty(current_user, Duty.VERIFY_LOAN_FUNDS, applicant)
    _require_guarantor_cleared(session.get(Loan, loan_id), current_user)

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
    _require_loan_decider(session, loan_id, current_user)

    loan = loan_service.approve_loan(
        session=session,
        loan_id=loan_id,
        approved_by=current_user,
    )

    # Permanent PDF record of the agreement (applicant, guarantor, approvals)
    db_loan = generate_agreement(session, session.get(Loan, loan.id))

    president_name = f"{current_user.first_name} {current_user.last_name}".strip()
    _notify_applicant_decision(
        session,
        background_tasks,
        loan=loan,
        action="approved",
        decider_name=president_name,
    )
    applicant = session.get(User, db_loan.user_id)
    for treasurer in responsible_users(session, Duty.VERIFY_LOAN_FUNDS, applicant):
        _notify_user(session, background_tasks, treasurer, "Loan approved: agreement ready",
                     f"{president_name} approved the loan of Rs. {db_loan.principal_paisa / 100:,.2f} for "
                     f"{applicant.first_name if applicant else 'a member'}. The agreement PDF is ready in the Loans tab.",
                     NotificationType.LOAN_APPROVED, db_loan.id)

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
    _require_loan_decider(session, loan_id, current_user)

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

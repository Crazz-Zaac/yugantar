from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session
from uuid import UUID

from app.core.db import get_session
from app.schemas.loan_payment_schema import (
    LoanPaymentCreate,
    LoanPaymentUpdate,
    LoanPaymentResponse,
    LoanPaymentListResponse,
    LoanPaymentReview,
)
from app.services.loan_payment_service import LoanPaymentService
from app.api.dependencies.auth import get_current_active_user
from app.models.user_model import User
from app.models.loan_model import Loan
from app.services.visibility import (
    can_view_loan,
    can_view_loan_payment,
    can_view_all_payments_of,
)


router = APIRouter(prefix="/loan-payments", tags=["loan-payments"])
loan_payment_service = LoanPaymentService()


# Member endpoints

@router.post(
    "/",
    response_model=LoanPaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_loan_payment(
    payment_in: LoanPaymentCreate,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Record a new loan payment for the authenticated user."""
    payment = loan_payment_service.create_payment(
        session=session,
        payment_in=payment_in,
        user_id=current_user.id,
    )
    return payment


@router.get(
    "/me",
    response_model=LoanPaymentListResponse,
)
def get_my_loan_payments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Get all loan payments for the authenticated user across all their loans."""
    payments, total = loan_payment_service.get_my_payments(
        session=session,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
    )
    return LoanPaymentListResponse(payments=payments, total=total)


@router.get(
    "/loan/{loan_id}",
    response_model=LoanPaymentListResponse,
)
def get_payments_for_loan(
    loan_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Get all payments for a specific loan.

    Owner and office bearers see every payment; other members see only
    verified payments of loans visible to them.
    """
    loan = session.get(Loan, loan_id)
    if not loan or not can_view_loan(current_user, loan):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    payments, total = loan_payment_service.get_payments_for_loan(
        session=session,
        loan_id=loan_id,
        skip=skip,
        limit=limit,
        verified_only=not can_view_all_payments_of(current_user, loan),
    )
    return LoanPaymentListResponse(payments=payments, total=total)


@router.get(
    "/{payment_id}",
    response_model=LoanPaymentResponse,
)
def get_loan_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Get a specific loan payment by ID (hidden payments return 404)."""
    payment = loan_payment_service.get_payment(session=session, payment_id=payment_id)
    loan = session.get(Loan, payment.loan_id)
    if not loan or not can_view_loan_payment(current_user, payment, loan):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan payment not found")
    return payment


@router.put(
    "/{payment_id}/me",
    response_model=LoanPaymentResponse,
)
def update_my_loan_payment(
    payment_id: UUID,
    payment_in: LoanPaymentUpdate,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Update a loan payment (only the owner can update, before verification)."""
    return loan_payment_service.update_payment(
        session=session,
        payment_id=payment_id,
        payment_in=payment_in,
        user_id=current_user.id,
    )


@router.delete(
    "/{payment_id}/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_my_loan_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Delete a loan payment (only the owner can delete)."""
    loan_payment_service.delete_payment(
        session=session,
        payment_id=payment_id,
        user_id=current_user.id,
    )
    return None


# Treasurer / Secretary endpoints (see services/duties.py)


@router.get(
    "/review/pending",
    response_model=LoanPaymentListResponse,
)
def get_pending_loan_payments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """List standalone loan payments awaiting review that you may act on
    (Treasurer; Secretary for the Treasurer's own payments)."""
    payments, total = loan_payment_service.list_pending_payments(
        session=session, current_user=current_user, skip=skip, limit=limit
    )
    return LoanPaymentListResponse(payments=payments, total=total)


@router.put(
    "/{payment_id}/review",
    response_model=LoanPaymentResponse,
)
def review_loan_payment(
    payment_id: UUID,
    review: LoanPaymentReview,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Verify or reject a pending loan payment. Only verified payments
    are credited to the loan."""
    return loan_payment_service.review_payment(
        session=session,
        payment_id=payment_id,
        new_status=review.status,
        reviewer=current_user,
    )


@router.delete(
    "/{payment_id}/moderator",
    status_code=status.HTTP_204_NO_CONTENT,
)
def moderator_delete_loan_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Delete a loan payment (Treasurer; Secretary for the Treasurer's own)."""
    loan_payment_service.moderator_delete_payment(
        session=session,
        payment_id=payment_id,
        current_user=current_user,
    )
    return None

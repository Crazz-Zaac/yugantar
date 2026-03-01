from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session
from uuid import UUID

from app.core.db import get_session
from app.schemas.loan_payment_schema import (
    LoanPaymentCreate,
    LoanPaymentUpdate,
    LoanPaymentResponse,
    LoanPaymentListResponse,
)
from app.services.loan_payment_service import LoanPaymentService
from app.api.dependencies.auth import get_current_active_user
from app.api.dependencies.admin import get_current_policy_manager
from app.models.user_model import User


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
    """Get all payments for a specific loan."""
    payments, total = loan_payment_service.get_payments_for_loan(
        session=session,
        loan_id=loan_id,
        skip=skip,
        limit=limit,
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
    """Get a specific loan payment by ID."""
    return loan_payment_service.get_payment(
        session=session,
        payment_id=payment_id,
    )


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


# Treasurer / Moderator endpoints


@router.delete(
    "/{payment_id}/moderator",
    status_code=status.HTTP_204_NO_CONTENT,
)
def moderator_delete_loan_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """Delete a loan payment (treasurer/moderator only)."""
    loan_payment_service.moderator_delete_payment(
        session=session,
        payment_id=payment_id,
        current_user=current_user,
    )
    return None

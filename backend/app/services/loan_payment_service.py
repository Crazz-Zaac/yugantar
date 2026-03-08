import uuid
from typing import Optional, List
from fastapi import HTTPException, status
from sqlmodel import Session, select, func
from datetime import datetime, timezone
from decimal import Decimal

from app.models.loan_model import Loan, LoanStatus
from app.models.loan_payment import LoanPayment, LoanPaymentType
from app.schemas.loan_payment_schema import (
    LoanPaymentCreate,
    LoanPaymentUpdate,
)
from app.models.user_model import User
from app.models.mixins.money import MoneyMixin


class LoanPaymentService:
    """Service class for managing loan payments."""

    def create_payment(
        self,
        session: Session,
        payment_in: LoanPaymentCreate,
        user_id: uuid.UUID,
    ) -> LoanPayment:
        """Create a new loan payment."""

        # Verify the loan exists and belongs to the user
        loan = session.get(Loan, payment_in.loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found",
            )

        if loan.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only make payments for your own loans",
            )

        if loan.status not in (LoanStatus.ACTIVE, LoanStatus.APPROVED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot make payments on a loan with status '{loan.status.value}'",
            )

        amount_paisa = MoneyMixin.rupees_to_paisa(payment_in.amount)

        payment = LoanPayment(
            loan_id=payment_in.loan_id,
            receipt_id=payment_in.receipt_id,
            payment_type=payment_in.payment_type,
            amount_paisa=amount_paisa,
            date=payment_in.date,
        )

        # Update the loan's total_paid_paisa
        loan.total_paid_paisa += amount_paisa

        session.add(payment)
        session.add(loan)
        session.commit()
        session.refresh(payment)
        session.refresh(loan)

        return payment

    def get_payment(
        self,
        session: Session,
        payment_id: uuid.UUID,
    ) -> LoanPayment:
        """Retrieve a single payment by ID."""

        payment = session.get(LoanPayment, payment_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan payment not found",
            )
        return payment

    def get_payments_for_loan(
        self,
        session: Session,
        loan_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[List[LoanPayment], int]:
        """Retrieve all payments for a specific loan."""

        # Verify loan exists
        loan = session.get(Loan, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found",
            )

        # Count total
        count_stmt = (
            select(func.count())
            .select_from(LoanPayment)
            .where(LoanPayment.loan_id == loan_id)
        )
        total = session.exec(count_stmt).one()

        # Fetch paginated
        statement = (
            select(LoanPayment)
            .where(LoanPayment.loan_id == loan_id)
            .order_by(LoanPayment.date.desc())
            .offset(skip)
            .limit(limit)
        )
        payments = session.exec(statement).all()

        return list(payments), total

    def get_my_payments(
        self,
        session: Session,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[List[LoanPayment], int]:
        """Retrieve all payments made by a user across all their loans."""

        # Get all loan IDs for the user
        loan_ids_stmt = select(Loan.id).where(Loan.user_id == user_id)
        loan_ids = session.exec(loan_ids_stmt).all()

        if not loan_ids:
            return [], 0

        # Count total
        count_stmt = (
            select(func.count())
            .select_from(LoanPayment)
            .where(LoanPayment.loan_id.in_(loan_ids))
        )
        total = session.exec(count_stmt).one()

        # Fetch paginated
        statement = (
            select(LoanPayment)
            .where(LoanPayment.loan_id.in_(loan_ids))
            .order_by(LoanPayment.date.desc())
            .offset(skip)
            .limit(limit)
        )
        payments = session.exec(statement).all()

        return list(payments), total

    def update_payment(
        self,
        session: Session,
        payment_id: uuid.UUID,
        payment_in: LoanPaymentUpdate,
        user_id: uuid.UUID,
    ) -> LoanPayment:
        """Update an existing loan payment (only by the owner, before any verification)."""

        payment = session.get(LoanPayment, payment_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan payment not found",
            )

        # Verify ownership through the loan
        loan = session.get(Loan, payment.loan_id)
        if not loan or loan.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own payments",
            )

        update_data = payment_in.model_dump(exclude_unset=True)

        # If amount is being changed, update loan totals accordingly
        if "amount" in update_data:
            old_paisa = payment.amount_paisa
            new_paisa = MoneyMixin.rupees_to_paisa(update_data.pop("amount"))
            diff = new_paisa - old_paisa

            payment.amount_paisa = new_paisa
            loan.total_paid_paisa += diff
            session.add(loan)

        for key, value in update_data.items():
            setattr(payment, key, value)

        session.add(payment)
        session.commit()
        session.refresh(payment)

        return payment

    def delete_payment(
        self,
        session: Session,
        payment_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        """Delete a loan payment (only by the owner)."""

        payment = session.get(LoanPayment, payment_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan payment not found",
            )

        # Verify ownership through the loan
        loan = session.get(Loan, payment.loan_id)
        if not loan or loan.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own payments",
            )

        # Reverse the payment from loan totals
        loan.total_paid_paisa -= payment.amount_paisa
        if loan.total_paid_paisa < 0:
            loan.total_paid_paisa = 0

        session.add(loan)
        session.delete(payment)
        session.commit()

    def moderator_delete_payment(
        self,
        session: Session,
        payment_id: uuid.UUID,
        current_user: User,
    ) -> None:
        """Delete a loan payment (moderator/treasurer)."""

        payment = session.get(LoanPayment, payment_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan payment not found",
            )

        # Reverse the payment from loan totals
        loan = session.get(Loan, payment.loan_id)
        if loan:
            loan.total_paid_paisa -= payment.amount_paisa
            if loan.total_paid_paisa < 0:
                loan.total_paid_paisa = 0
            session.add(loan)

        session.delete(payment)
        session.commit()

import uuid
from typing import List
from fastapi import HTTPException, status
from sqlmodel import Session, select, func
from datetime import datetime, timezone

from app.models.loan_model import Loan, LoanStatus
from app.models.loan_payment import LoanPayment, LoanPaymentStatus, LoanPaymentType
from app.schemas.loan_payment_schema import (
    LoanPaymentCreate,
    LoanPaymentUpdate,
)
from app.models.user_model import User
from app.models.receipt_model import Receipt
from app.services.duties import Duty, require_duty, denial_reason, may_perform_any
from app.models.mixins.money import MoneyMixin


class LoanPaymentService:
    """Service class for managing loan payments.

    Security model: a member can only *submit* a payment (status PENDING).
    The loan's totals change only when a reviewer VERIFIES the payment
    (directly, or by verifying the smart deposit it belongs to).
    """

    # Helpers that keep loan totals in sync with verified payments

    @staticmethod
    def apply_verified_payment(loan: Loan, payment: LoanPayment) -> None:
        """Credit a just-verified payment to its loan."""
        loan.total_paid_paisa += payment.amount_paisa
        if (
            payment.payment_type == LoanPaymentType.PRINCIPAL
            and loan.total_paid_paisa >= loan.principal_paisa
        ):
            loan.status = LoanStatus.PAID

    @staticmethod
    def reverse_verified_payment(loan: Loan, payment: LoanPayment) -> None:
        """Undo the effect of a verified payment that is being removed."""
        loan.total_paid_paisa = max(0, loan.total_paid_paisa - payment.amount_paisa)
        if (
            loan.status == LoanStatus.PAID
            and loan.total_paid_paisa < loan.principal_paisa
        ):
            loan.status = LoanStatus.ACTIVE

    @classmethod
    def review_payment_record(
        cls,
        session: Session,
        payment: LoanPayment,
        new_status: LoanPaymentStatus,
        reviewer: User,
    ) -> None:
        """Set a PENDING payment to VERIFIED/REJECTED (no commit)."""
        if payment.status != LoanPaymentStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only pending payments can be reviewed. Current status: {payment.status.value}",
            )
        if new_status == LoanPaymentStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Review status must be 'verified' or 'rejected'.",
            )

        if new_status == LoanPaymentStatus.VERIFIED:
            loan = session.get(Loan, payment.loan_id)
            if not loan:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Loan not found",
                )
            cls.apply_verified_payment(loan, payment)
            session.add(loan)

        payment.status = new_status
        payment.verified_by = f"{reviewer.first_name} {reviewer.last_name}".strip()
        payment.verified_at = datetime.now(timezone.utc)
        session.add(payment)

    def _get_owned_pending_payment(
        self, session: Session, payment_id: uuid.UUID, user_id: uuid.UUID
    ) -> LoanPayment:
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
                detail="You can only modify your own payments",
            )

        if payment.status != LoanPaymentStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending payments can be modified",
            )
        if payment.deposit_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This payment belongs to a deposit; edit or withdraw the deposit instead",
            )
        return payment

    # Member operations

    def create_payment(
        self,
        session: Session,
        payment_in: LoanPaymentCreate,
        user_id: uuid.UUID,
    ) -> LoanPayment:
        """Submit a new loan payment (PENDING until a reviewer verifies it)."""

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

        if payment_in.receipt_id is not None:
            receipt = session.get(Receipt, payment_in.receipt_id)
            if not receipt or receipt.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Receipt not found",
                )

        payment = LoanPayment(
            loan_id=payment_in.loan_id,
            receipt_id=payment_in.receipt_id,
            payment_type=payment_in.payment_type,
            amount_paisa=MoneyMixin.rupees_to_paisa(payment_in.amount),
            date=payment_in.date,
            status=LoanPaymentStatus.PENDING,
        )

        # Loan totals are NOT touched here; see review_payment().
        session.add(payment)
        session.commit()
        session.refresh(payment)

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
        verified_only: bool = False,
    ) -> tuple[List[LoanPayment], int]:
        """Retrieve payments for a specific loan (optionally verified only)."""

        # Verify loan exists
        loan = session.get(Loan, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found",
            )

        conditions = [LoanPayment.loan_id == loan_id]
        if verified_only:
            conditions.append(LoanPayment.status == LoanPaymentStatus.VERIFIED)

        # Count total
        count_stmt = select(func.count()).select_from(LoanPayment).where(*conditions)
        total = session.exec(count_stmt).one()

        # Fetch paginated
        statement = (
            select(LoanPayment)
            .where(*conditions)
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
        """Update a PENDING loan payment (owner only)."""

        payment = self._get_owned_pending_payment(session, payment_id, user_id)

        update_data = payment_in.model_dump(exclude_unset=True)
        if update_data.get("receipt_id") is not None:
            receipt = session.get(Receipt, update_data["receipt_id"])
            if not receipt or receipt.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Receipt not found",
                )
        if "amount" in update_data:
            payment.amount_paisa = MoneyMixin.rupees_to_paisa(update_data.pop("amount"))

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
        """Withdraw a PENDING loan payment (owner only)."""

        payment = self._get_owned_pending_payment(session, payment_id, user_id)
        session.delete(payment)
        session.commit()

    # Reviewer operations (treasurer / moderator / admin)

    def list_pending_payments(
        self,
        session: Session,
        current_user: User,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[List[LoanPayment], int]:
        """Standalone payments awaiting review that this user may act on
        (deposit-linked ones are reviewed through their deposit)."""
        if not may_perform_any(current_user, Duty.REVIEW_LOAN_PAYMENT):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )
        rows = session.exec(
            select(LoanPayment, Loan)
            .join(Loan, LoanPayment.loan_id == Loan.id)
            .where(
                LoanPayment.status == LoanPaymentStatus.PENDING,
                LoanPayment.deposit_id.is_(None),
            )
            .order_by(LoanPayment.date.desc())
        ).all()
        actionable = [
            payment
            for payment, loan in rows
            if denial_reason(current_user, Duty.REVIEW_LOAN_PAYMENT, loan.user) is None
        ]
        return actionable[skip : skip + limit], len(actionable)

    def review_payment(
        self,
        session: Session,
        payment_id: uuid.UUID,
        new_status: LoanPaymentStatus,
        reviewer: User,
    ) -> LoanPayment:
        """Verify or reject a standalone pending payment."""
        payment = self.get_payment(session, payment_id)
        if payment.deposit_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This payment belongs to a deposit; review the deposit instead",
            )
        loan = session.get(Loan, payment.loan_id)
        require_duty(reviewer, Duty.REVIEW_LOAN_PAYMENT, loan.user if loan else None)

        self.review_payment_record(session, payment, new_status, reviewer)
        session.commit()
        session.refresh(payment)
        return payment

    def moderator_delete_payment(
        self,
        session: Session,
        payment_id: uuid.UUID,
        current_user: User,
    ) -> None:
        """Delete a loan payment (same people who may review it)."""

        payment = self.get_payment(session, payment_id)
        owner_loan = session.get(Loan, payment.loan_id)
        require_duty(
            current_user, Duty.REVIEW_LOAN_PAYMENT, owner_loan.user if owner_loan else None
        )

        # Only verified payments were ever credited to the loan
        if payment.status == LoanPaymentStatus.VERIFIED:
            loan = session.get(Loan, payment.loan_id)
            if loan:
                self.reverse_verified_payment(loan, payment)
                session.add(loan)

        session.delete(payment)
        session.commit()

import uuid
from typing import Optional
from fastapi import HTTPException, status
from sqlmodel import Session, select
from datetime import datetime, timezone

from app.models.policy.deposit_policy import DepositPolicy
from app.models.policy.base_policy import PolicyStatus
from app.models.deposit_model import Deposit, DepositVerificationStatus
from app.schemas.deposit_schema import (
    DepositCreate,
    DepositUserUpdate,
    DepositModeratorUpdate,
)
from app.models.user_model import User, CooperativeRole, AccessRole
from app.utils.deposit_date_utils import (
    calculate_due_date,
    calculate_late_fine,
    is_deposit_late,
    days_until_due,
)
from app.models.mixins.money import MoneyMixin
from app.models.fine_model import Fine, FineType
from app.models.loan_model import Loan
from app.models.loan_payment import LoanPayment, LoanPaymentStatus
from app.services.loan_payment_service import LoanPaymentService
from app.services.duties import Duty, require_duty, denial_reason, may_perform_any


def require_active_deposit_policy(session: Session, policy_id) -> DepositPolicy:
    """Deposits are only accepted under a policy members have adopted (ACTIVE):
    drafts, policies still being signed, and lapsed/void ones don't apply."""
    policy = session.get(DepositPolicy, policy_id) if policy_id else None
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deposit policy not found")
    if policy.status != PolicyStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deposits can only be made under an active deposit policy.",
        )
    return policy


class DepositService:
    """
    Service class for managing deposits.
    """

    @staticmethod
    def _linked_payments(session: Session, deposit_id: uuid.UUID) -> list[LoanPayment]:
        return list(
            session.exec(
                select(LoanPayment).where(LoanPayment.deposit_id == deposit_id)
            ).all()
        )

    def create_deposit(
        self,
        session: Session,
        deposit_in: DepositCreate,
        user_id: uuid.UUID,
    ) -> Deposit:
        policy = require_active_deposit_policy(session, deposit_in.policy_id)

        now = datetime.now(timezone.utc)
        due_date = calculate_due_date(policy=policy, reference_date=now)

        # Only the amount and type come from the member; everything else
        # (status, reviewer, dates) is decided here.
        new_deposit = Deposit(
            policy_id=policy.policy_id,
            user_id=user_id,
            deposit_type=deposit_in.deposit_type,
            due_deposit_date=due_date,
            deposited_date=now,
            amount_paisa=MoneyMixin.rupees_to_paisa(deposit_in.deposited_amount),
            verification_status=DepositVerificationStatus.PENDING,
        )

        # Check for late deposit and apply fine if necessary
        if is_deposit_late(now, due_date):
            fine_amount = calculate_late_fine(
                deposited_date=now,
                due_deposit_date=due_date,
                amount_to_be_deposited=policy.amount_rupees,
                late_deposit_fine_percentage=policy.late_deposit_fine,
            )
            fine = Fine(
                user_id=user_id,
                deposit_id=new_deposit.id,
                amount_paisa=MoneyMixin.rupees_to_paisa(fine_amount),
                fine_type=FineType.DEPOSIT,
                date=now,
            )
            session.add(fine)

        session.add(new_deposit)
        session.commit()
        session.refresh(new_deposit)

        return new_deposit

    def user_update_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        deposit_in: DepositUserUpdate,
        user_id: uuid.UUID,
    ) -> Deposit:
        """
        Update an existing deposit.
        """

        statement = select(Deposit).where(
            Deposit.id == deposit_id,
            Deposit.user_id == user_id,
        )
        db_deposit = session.exec(statement).first()

        if not db_deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )

        if db_deposit.verification_status != DepositVerificationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending deposits can be edited",
            )

        deposit_data = deposit_in.model_dump(exclude_unset=True)
        if deposit_data.get("deposited_amount") is not None:
            # stored in paisa; "deposited_amount" isn't a column
            db_deposit.amount_paisa = MoneyMixin.rupees_to_paisa(deposit_data["deposited_amount"])

        session.add(db_deposit)
        session.commit()
        session.refresh(db_deposit)

        return db_deposit

    def verify_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        deposit_in: DepositModeratorUpdate,
        current_user: User,
    ) -> Deposit:
        """
        Verify or reject a pending deposit (Treasurer; Secretary for the
        Treasurer's own deposits; never your own; see services/duties.py).
        """
        deposit = session.get(Deposit, deposit_id)
        if not deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )
        require_duty(current_user, Duty.VERIFY_DEPOSIT, session.get(User, deposit.user_id))

        if deposit.verification_status != DepositVerificationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Only pending deposits can be reviewed. "
                    f"Current status: {deposit.verification_status.value}"
                ),
            )

        deposit.verification_status = deposit_in.verification_status
        deposit.verified_by = f"{current_user.first_name} {current_user.last_name}"
        session.add(deposit)

        # Loan payments allocated from this deposit follow its outcome; only
        # now (on VERIFIED) are they credited to the loan.
        if deposit_in.verification_status in (
            DepositVerificationStatus.VERIFIED,
            DepositVerificationStatus.REJECTED,
        ):
            payment_status = (
                LoanPaymentStatus.VERIFIED
                if deposit_in.verification_status == DepositVerificationStatus.VERIFIED
                else LoanPaymentStatus.REJECTED
            )
            for payment in self._linked_payments(session, deposit.id):
                if payment.status == LoanPaymentStatus.PENDING:
                    LoanPaymentService.review_payment_record(
                        session, payment, payment_status, current_user
                    )

        session.commit()
        session.refresh(deposit)

        return deposit

    def get_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
    ) -> Optional[Deposit]:
        """
        Retrieve a deposit by its ID.
        """

        statement = select(Deposit).where(Deposit.id == deposit_id)
        db_deposit = session.exec(statement).first()

        if not db_deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )

        return db_deposit

    def get_upcoming_deposits(
        self,
        session: Session,
        user_id: uuid.UUID,
        days_ahead: int = 7,
    ) -> list[Deposit]:
        """
        Retrieve deposits due within the next 'days_ahead' days for a user.
        """
        from datetime import timedelta

        now = datetime.now(timezone.utc)
        end_date = now + timedelta(days=days_ahead)

        statement = (
            select(Deposit)
            .where(
                Deposit.user_id == user_id,
                Deposit.due_deposit_date >= now,
                Deposit.due_deposit_date <= end_date,
            )
            .order_by(Deposit.due_deposit_date)
        )  # typing: ignore

        result = session.exec(statement).all()

        return list(result)

    def user_delete_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        """
        Delete a deposit by its ID.
        """

        statement = select(Deposit).where(
            Deposit.id == deposit_id,
            Deposit.user_id == user_id,
        )
        deposit = session.exec(statement).first()

        if not deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )

        if deposit.verification_status != DepositVerificationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending deposits can be withdrawn",
            )
        # Linked loan payments are still pending (never credited), just remove them
        for payment in self._linked_payments(session, deposit.id):
            session.delete(payment)
        session.delete(deposit)
        session.commit()

    def moderator_delete_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        current_user: User,
    ) -> None:
        """
        Delete a deposit by its ID (same people who may verify it).
        """
        deposit = session.get(Deposit, deposit_id)
        if not deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )
        require_duty(current_user, Duty.VERIFY_DEPOSIT, session.get(User, deposit.user_id))

        # Remove linked loan payments, undoing any that were credited to a loan
        for payment in self._linked_payments(session, deposit.id):
            if payment.status == LoanPaymentStatus.VERIFIED:
                loan = session.get(Loan, payment.loan_id)
                if loan:
                    LoanPaymentService.reverse_verified_payment(loan, payment)
                    session.add(loan)
            session.delete(payment)

        session.delete(deposit)
        session.commit()

    def list_my_deposits(
        self,
        session: Session,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Deposit]:
        statement = (
            select(Deposit)
            .where(Deposit.user_id == user_id)
            .order_by(Deposit.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(session.exec(statement).all())

    def list_community_deposits(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Deposit]:
        statement = (
            select(Deposit)
            .where(Deposit.verification_status == DepositVerificationStatus.VERIFIED)
            .order_by(Deposit.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(session.exec(statement).all())

    def list_deposit_history(
        self,
        session: Session,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Deposit]:
        statement = (
            select(Deposit)
            .where(
                Deposit.user_id == user_id,
                Deposit.verification_status.in_(
                    [
                        DepositVerificationStatus.VERIFIED,
                        DepositVerificationStatus.REJECTED,
                    ]
                ),
            )
            .order_by(Deposit.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(session.exec(statement).all())

    def list_pending_review_deposits(
        self,
        session: Session,
        current_user: User,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Deposit]:
        """Pending deposits this user may act on (never their own)."""
        if not may_perform_any(current_user, Duty.VERIFY_DEPOSIT):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )

        statement = (
            select(Deposit)
            .where(Deposit.verification_status == DepositVerificationStatus.PENDING)
            .order_by(Deposit.created_at.desc())
        )
        actionable = [
            d
            for d in session.exec(statement).all()
            if denial_reason(current_user, Duty.VERIFY_DEPOSIT, d.user) is None
        ]
        return actionable[skip : skip + limit]

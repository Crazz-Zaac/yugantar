import uuid
from typing import Tuple, List
from fastapi import HTTPException, status
from sqlmodel import Session, select, func, col
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from decimal import Decimal

from app.models.loan_model import Loan, LoanStatus
from app.models.policy.loan_policy import LoanPolicy
from app.models.policy.base_policy import PolicyStatus
from app.models.user_model import User
from app.models.mixins.money import MoneyMixin
from app.schemas.loan_schema import (
    LoanApplicationCreate,
    LoanResponse,
    LoanCalculatorRequest,
    LoanCalculatorResponse,
)


def _loan_to_response(loan: Loan, applicant_name: str | None = None) -> LoanResponse:
    """Convert a Loan ORM object to a LoanResponse dict."""
    return LoanResponse(
        id=loan.id,
        policy_id=loan.policy_id,
        user_id=loan.user_id,
        principal_rupees=Decimal(loan.principal_paisa) / 100,
        penalties_rupees=Decimal(loan.penalties_paisa) / 100,
        accrued_interest_rupees=Decimal(loan.accrued_interest_paisa) / 100,
        total_paid_rupees=Decimal(loan.total_paid_paisa) / 100,
        interest_rate=loan.interest_rate,
        status=loan.status,
        start_date=loan.start_date,
        maturity_date=loan.maturity_date,
        created_at=loan.created_at,
        updated_at=loan.updated_at,
        approved_by=loan.approved_by,
        approved_at=loan.approved_at,
        rejected_by=loan.rejected_by,
        rejected_at=loan.rejected_at,
        rejection_reason=loan.rejection_reason,
        disbursed_at=loan.disbursed_at,
        collateral_details=loan.collateral_details,
        renewal_count=loan.renewal_count,
        max_renewals=loan.max_renewals,
        applicant_name=applicant_name,
        purpose=loan.purpose,
        fund_verified_by=loan.fund_verified_by,
        fund_verified_at=loan.fund_verified_at,
    )


class LoanService:
    """Service for the loan application workflow."""

    # Apply for a loan
    def apply_for_loan(
        self,
        session: Session,
        application: LoanApplicationCreate,
        user: User,
    ) -> LoanResponse:
        """
        A member applies for a loan under an active policy.
        Creates a Loan with status=PENDING.
        """
        # 1. Validate policy exists and is active
        policy = session.get(LoanPolicy, application.policy_id)
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan policy not found.",
            )
        if policy.status != PolicyStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Loan policy is not currently active.",
            )

        # 2. Validate amount within policy bounds
        amount = application.amount_rupees
        if amount < policy.min_loan_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested amount Rs. {amount} is below the minimum Rs. {policy.min_loan_amount}.",
            )
        if amount > policy.max_loan_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested amount Rs. {amount} exceeds the maximum Rs. {policy.max_loan_amount}.",
            )

        # 3. Collateral check
        if policy.requires_collateral and not application.collateral_details:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This policy requires collateral details.",
            )

        # 4. Check no other PENDING or ACTIVE loan for this user
        existing = session.exec(
            select(Loan).where(
                Loan.user_id == user.id,
                col(Loan.status).in_([LoanStatus.PENDING, LoanStatus.ACTIVE]),
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending or active loan. Please complete it before applying for a new one.",
            )

        # 5. Create the loan record
        now = datetime.now(timezone.utc)
        maturity = now + relativedelta(months=application.term_months)
        principal_paisa = MoneyMixin.rupees_to_paisa(amount)

        loan = Loan(
            policy_id=policy.policy_id,
            user_id=user.id,
            principal_paisa=principal_paisa,
            interest_rate=policy.interest_rate,
            penalties_paisa=0,
            accrued_interest_paisa=0,
            total_paid_paisa=0,
            start_date=now,
            maturity_date=maturity,
            status=LoanStatus.PENDING,
            collateral_details=application.collateral_details,
            max_renewals=policy.max_renewals,
            purpose=application.purpose,
        )

        session.add(loan)
        session.commit()
        session.refresh(loan)

        full_name = f"{user.first_name} {user.last_name}".strip()
        return _loan_to_response(loan, applicant_name=full_name)

    # Get my loans
    def get_my_loans(
        self,
        session: Session,
        user_id: uuid.UUID,
        status_filter: LoanStatus | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[LoanResponse], int]:
        base = select(Loan).where(Loan.user_id == user_id)
        if status_filter:
            base = base.where(Loan.status == status_filter)

        total = session.exec(select(func.count()).select_from(base.subquery())).one()

        loans = session.exec(
            base.order_by(col(Loan.created_at).desc()).offset(skip).limit(limit)
        ).all()

        user = session.get(User, user_id)
        name = f"{user.first_name} {user.last_name}".strip() if user else None
        return [_loan_to_response(l, applicant_name=name) for l in loans], total

    # Get a single loan 
    def get_loan(
        self,
        session: Session,
        loan_id: uuid.UUID,
    ) -> LoanResponse:
        loan = session.get(Loan, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found.",
            )
        user = session.get(User, loan.user_id)
        name = f"{user.first_name} {user.last_name}".strip() if user else None
        return _loan_to_response(loan, applicant_name=name)

    # Get all pending loans (for treasurers/presidents) 
    def get_pending_loans(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[LoanResponse], int]:
        base = select(Loan).where(Loan.status == LoanStatus.PENDING)
        total = session.exec(select(func.count()).select_from(base.subquery())).one()
        loans = session.exec(
            base.order_by(col(Loan.created_at).desc()).offset(skip).limit(limit)
        ).all()
        result = []
        for loan in loans:
            user = session.get(User, loan.user_id)
            name = f"{user.first_name} {user.last_name}".strip() if user else None
            result.append(_loan_to_response(loan, applicant_name=name))
        return result, total

    # Community loans (all approved/active/paid – anonymised) 
    def get_community_loans(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[LoanResponse], int]:
        base = select(Loan).where(
            col(Loan.status).in_(
                [
                    LoanStatus.APPROVED,
                    LoanStatus.ACTIVE,
                    LoanStatus.PAID,
                ]
            )
        )
        total = session.exec(select(func.count()).select_from(base.subquery())).one()
        loans = session.exec(
            base.order_by(col(Loan.created_at).desc()).offset(skip).limit(limit)
        ).all()
        result = []
        for loan in loans:
            user = session.get(User, loan.user_id)
            # Only show first name + last initial for privacy
            if user:
                last_initial = f"{user.last_name[0]}." if user.last_name else ""
                name = f"{user.first_name} {last_initial}".strip()
            else:
                name = "Unknown"
            result.append(_loan_to_response(loan, applicant_name=name))
        return result, total

    # Treasurer verifies funds 
    def verify_funds(
        self,
        session: Session,
        loan_id: uuid.UUID,
        verified_by: User,
    ) -> Loan:
        """
        Treasurer confirms the cooperative has sufficient funds.
        Marks the loan's fund_verified_by / fund_verified_at fields.
        Does NOT change status — the president still needs to approve.
        """
        loan = session.get(Loan, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found.",
            )
        if loan.status != LoanStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only pending loans can be verified. Current status: {loan.status.value}",
            )
        if loan.fund_verified_by:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Funds have already been verified for this loan.",
            )

        loan.fund_verified_by = verified_by.email
        loan.fund_verified_at = datetime.now(timezone.utc)
        session.add(loan)
        session.commit()
        session.refresh(loan)
        return loan

    # President approves 
    def approve_loan(
        self,
        session: Session,
        loan_id: uuid.UUID,
        approved_by: User,
    ) -> Loan:
        loan = session.get(Loan, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found.",
            )
        if loan.status != LoanStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only pending loans can be approved. Current status: {loan.status.value}",
            )
        if not loan.fund_verified_by:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Funds must be verified by a Treasurer before the loan can be approved.",
            )

        now = datetime.now(timezone.utc)
        loan.status = LoanStatus.APPROVED
        loan.approved_by = approved_by.email
        loan.approved_at = now
        loan.disbursed_at = now  # mark disbursement

        session.add(loan)
        session.commit()
        session.refresh(loan)
        return loan

    # President rejects 
    def reject_loan(
        self,
        session: Session,
        loan_id: uuid.UUID,
        rejected_by: User,
        reason: str,
    ) -> Loan:
        loan = session.get(Loan, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found.",
            )
        if loan.status != LoanStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only pending loans can be rejected. Current status: {loan.status.value}",
            )

        loan.status = LoanStatus.REJECTED
        loan.rejected_by = rejected_by.email
        loan.rejected_at = datetime.now(timezone.utc)
        loan.rejection_reason = reason

        session.add(loan)
        session.commit()
        session.refresh(loan)
        return loan

    # Loan calculator (pure math, no DB)
    @staticmethod
    def calculate_loan(req: LoanCalculatorRequest) -> LoanCalculatorResponse:
        """Simple interest calculator."""
        principal = req.principal_rupees
        rate = req.interest_rate
        months = req.term_months

        # Monthly simple interest = principal × (annual_rate/100) / 12
        monthly_interest = (principal * rate / 100) / 12
        total_interest = monthly_interest * months
        total_repayment = principal + total_interest

        return LoanCalculatorResponse(
            principal_rupees=principal,
            interest_rate=rate,
            term_months=months,
            monthly_interest_rupees=monthly_interest.quantize(Decimal("0.01")),
            total_interest_rupees=total_interest.quantize(Decimal("0.01")),
            total_repayment_rupees=total_repayment.quantize(Decimal("0.01")),
        )

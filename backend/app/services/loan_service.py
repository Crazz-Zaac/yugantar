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
from app.services.duties import can_be_guarantor
from app.utils.local_time import local_day_bounds
from app.services.duties import Duty, denial_reason
from app.schemas.loan_schema import (
    LoanApplicationCreate,
    LoanResponse,
    LoanCalculatorRequest,
    LoanCalculatorResponse,
)


def _loan_to_response(loan: Loan, applicant_name: str | None = None, guarantor_name: str | None = None) -> LoanResponse:
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
        guarantor_user_id=loan.guarantor_user_id,
        guarantor_name=guarantor_name,
        guarantor_status=loan.guarantor_status,
        guarantor_signed_name=loan.guarantor_signed_name,
        guarantor_signed_at=loan.guarantor_signed_at,
        guarantor_note=loan.guarantor_note,
        has_agreement=bool(loan.agreement_file_key),
        agreement_generated_at=loan.agreement_generated_at,
    )


def _full_name(user: "User | None") -> str | None:
    return f"{user.first_name} {user.last_name}".strip() if user else None


def loan_response(session: Session, loan: Loan) -> LoanResponse:
    """LoanResponse with applicant and guarantor names filled in."""
    guarantor = session.get(User, loan.guarantor_user_id) if loan.guarantor_user_id else None
    return _loan_to_response(loan, _full_name(session.get(User, loan.user_id)), _full_name(guarantor))


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

        # 3. Guarantor: a registered member stands surety (required when the
        #    policy requires collateral). They sign before the Treasurer reviews.
        guarantor = None
        if application.guarantor_user_id is not None:
            guarantor = session.get(User, application.guarantor_user_id)
            if not can_be_guarantor(guarantor):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The guarantor must be an active registered member.",
                )
            if guarantor.id == user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You can't be your own guarantor.",
                )
        elif policy.requires_collateral:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This policy requires a guarantor: choose a member who will stand surety for the loan.",
            )

        # 4. One open loan at a time: pending, approved (not yet disbursed) or active
        existing = session.exec(
            select(Loan).where(
                Loan.user_id == user.id,
                col(Loan.status).in_([LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.ACTIVE]),
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending, approved or active loan. Please complete it before applying for a new one.",
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
            guarantor_user_id=guarantor.id if guarantor else None,
            guarantor_status="pending" if guarantor else None,
            max_renewals=policy.max_renewals,
            purpose=application.purpose,
        )

        session.add(loan)
        session.commit()
        session.refresh(loan)

        return loan_response(session, loan)

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
        return [loan_response(session, l) for l in loans], total

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
        return loan_response(session, loan)

    # Get all pending loans (for treasurers/presidents) 
    def get_pending_loans(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 50,
        viewer: User | None = None,
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
            response = loan_response(session, loan)
            waiting_for_guarantor = loan.guarantor_status == "pending"
            is_guarantor = viewer is not None and loan.guarantor_user_id == viewer.id
            if viewer is not None:
                # Same rules the endpoints enforce, so the UI only offers
                # actions that will succeed (services/duties.py).
                response.viewer_can_verify_funds = (
                    not waiting_for_guarantor
                    and not is_guarantor
                    and not loan.fund_verified_by
                    and denial_reason(viewer, Duty.VERIFY_LOAN_FUNDS, user) is None
                )
                response.viewer_can_decide = (
                    not is_guarantor
                    and bool(loan.fund_verified_by)
                    and loan.fund_verified_by != viewer.email
                    and denial_reason(viewer, Duty.DECIDE_LOAN, user) is None
                )
                response.is_own_application = loan.user_id == viewer.id
            result.append(response)
        return result, total

    # Community loans (all approved/active/paid; full names: closed group) 
    def get_community_loans(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 50,
        member: str | None = None,
        status_filter: LoanStatus | None = None,
        purpose: str | None = None,
        date_from=None,
        date_to=None,
    ) -> Tuple[List[LoanResponse], int]:
        """Approved/active/paid loans, with optional filters: member name,
        status, purpose, Nepal-calendar date range (approval date)."""
        public = [LoanStatus.APPROVED, LoanStatus.ACTIVE, LoanStatus.PAID]
        base = select(Loan).where(col(Loan.status).in_(public))
        if status_filter in public:
            base = base.where(Loan.status == status_filter)
        if member and member.strip():
            base = base.join(User, Loan.user_id == User.id).where(
                (User.first_name + " " + User.last_name).ilike(f"%{member.strip()}%")
            )
        if purpose and purpose.strip():
            base = base.where(col(Loan.purpose).ilike(f"%{purpose.strip()}%"))
        start, end = local_day_bounds(date_from, date_to)
        loan_date = func.coalesce(Loan.approved_at, Loan.start_date)
        if start:
            base = base.where(loan_date >= start)
        if end:
            base = base.where(loan_date < end)
        total = session.exec(select(func.count()).select_from(base.subquery())).one()
        loans = session.exec(
            base.order_by(col(Loan.created_at).desc()).offset(skip).limit(limit)
        ).all()
        result = []
        for loan in loans:
            user = session.get(User, loan.user_id)
            name = f"{user.first_name} {user.last_name}".strip() if user else "Unknown"
            result.append(loan_response(session, loan))
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


    # ── Guarantor ────────────────────────────────────────────────────────
    def guarantee_requests(self, session: Session, user: User) -> List[LoanResponse]:
        """Loans waiting for this member's signature as guarantor."""
        loans = session.exec(
            select(Loan).where(
                Loan.guarantor_user_id == user.id,
                Loan.guarantor_status == "pending",
                Loan.status == LoanStatus.PENDING,
            )
        ).all()
        return [loan_response(session, l) for l in loans]

    def respond_to_guarantee(self, session: Session, loan_id: uuid.UUID, user: User, accept: bool, note: str | None) -> Loan:
        loan = session.get(Loan, loan_id)
        if not loan or loan.guarantor_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guarantee request not found.")
        if loan.status != LoanStatus.PENDING or loan.guarantor_status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This request has already been answered.")
        now = datetime.now(timezone.utc)
        loan.guarantor_note = (note or "").strip() or None
        if accept:
            loan.guarantor_status = "signed"
            loan.guarantor_signed_name = f"{user.first_name} {user.last_name}".strip()
            loan.guarantor_signed_at = now
        else:
            # Declining closes the application; the member can apply again
            # with another guarantor.
            loan.guarantor_status = "declined"
            loan.status = LoanStatus.REJECTED
            loan.rejected_by = f"Guarantor {user.first_name} {user.last_name}".strip()
            loan.rejected_at = now
            loan.rejection_reason = "The guarantor declined" + (f": {loan.guarantor_note}" if loan.guarantor_note else ".")
        session.add(loan)
        session.commit()
        session.refresh(loan)
        return loan

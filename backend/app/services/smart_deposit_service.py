from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.policy.deposit_policy import DepositPolicy
from app.models.deposit_model import Deposit, DepositType, DepositVerificationStatus
from app.models.fine_model import Fine, FineType
from app.models.loan_model import Loan, LoanStatus
from app.models.loan_payment import LoanPayment, LoanPaymentType
from app.models.mixins.money import MoneyMixin
from app.utils.deposit_date_utils import (
    calculate_due_date,
    calculate_late_fine,
    is_deposit_late,
)

from app.schemas.smart_deposit_schema import (
    DepositPreviewRequest,
    DepositPreviewResponse,
    LoanSummary,
    SplitAllocation,
    SplitCategory,
    SmartDepositCreate,
    SmartDepositAllocation,
    SmartDepositResponse,
)


class SmartDepositService:
    """Handles preview + execute for the smart-deposit flow."""

    def preview(
        self,
        session: Session,
        req: DepositPreviewRequest,
        user_id: uuid.UUID,
    ) -> DepositPreviewResponse:
        policy = session.get(DepositPolicy, req.policy_id)
        if not policy:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Deposit policy not found")

        net_amount = req.ocr_amount
        required_deposit = policy.amount_rupees  # Decimal in rupees
        now = req.ocr_date or datetime.now(timezone.utc)
        due_date = calculate_due_date(policy=policy, reference_date=now)

        late = is_deposit_late(now, due_date)
        fine_pct = float(policy.late_deposit_fine)
        fine_amount = Decimal(0)
        if late:
            fine_amount = calculate_late_fine(
                deposited_date=now,
                due_deposit_date=due_date,
                late_deposit_fine_percentage=policy.late_deposit_fine,
                amount_to_be_deposited=required_deposit,
            )

        #  excess / insufficient
        mandatory = required_deposit + fine_amount
        excess = net_amount - mandatory
        is_insufficient = excess < 0

        allocations: list[SplitAllocation] = []
        stmt = select(Loan).where(
            Loan.user_id == user_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.APPROVED]),
        )
        loans = list(session.exec(stmt).all())

        loan_summaries = []
        for ln in loans:
            outstanding_principal = ln.principal_paisa - ln.total_paid_paisa
            if outstanding_principal < 0:
                outstanding_principal = 0
            loan_summaries.append(
                LoanSummary(
                    loan_id=ln.id,
                    principal_paisa=ln.principal_paisa,
                    accrued_interest_paisa=ln.accrued_interest_paisa,
                    total_paid_paisa=ln.total_paid_paisa,
                    outstanding_principal_paisa=outstanding_principal,
                    outstanding_interest_paisa=ln.accrued_interest_paisa,
                    interest_rate=ln.interest_rate,
                )
            )

        return DepositPreviewResponse(
            ocr_amount=req.ocr_amount,
            ocr_charge=req.ocr_charge,
            net_amount=net_amount,
            required_deposit=required_deposit,
            due_date=due_date,
            is_late=late,
            fine_amount=fine_amount,
            fine_percentage=fine_pct,
            excess_amount=excess if excess > 0 else Decimal(0),
            is_insufficient=is_insufficient,
            allocations=allocations,
            active_loans=loan_summaries,
        )

    def execute(
        self,
        session: Session,
        req: SmartDepositCreate,
        user_id: uuid.UUID,
    ) -> SmartDepositResponse:
        now = req.ocr_date or datetime.now(timezone.utc)
        alloc_total = sum(a.amount_rupees for a in req.allocations)

        net_amount = alloc_total
        if req.ocr_amount is not None:
            net_amount = req.ocr_amount
            if abs(alloc_total - net_amount) > Decimal("1"):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Allocation total ({alloc_total}) does not match net amount ({net_amount})",
                )

        deposit_amount = Decimal(0)
        advance_amount = Decimal(0)
        fine_alloc = Decimal(0)
        loan_allocs: list[SmartDepositAllocation] = []

        for a in req.allocations:
            if a.category == SplitCategory.DEPOSIT:
                deposit_amount += a.amount_rupees
            elif a.category == SplitCategory.ADVANCE_DEPOSIT:
                advance_amount += a.amount_rupees
            elif a.category == SplitCategory.FINE:
                fine_alloc += a.amount_rupees
            elif a.category in (
                SplitCategory.LOAN_PRINCIPAL,
                SplitCategory.LOAN_INTEREST,
                SplitCategory.LOAN_RENEWAL,
            ):
                loan_allocs.append(a)

        if alloc_total <= 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "At least one allocation with a positive amount is required",
            )

        if not req.policy_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "policy_id is required for smart deposit submission",
            )

        policy = session.get(DepositPolicy, req.policy_id)
        if not policy:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Deposit policy not found",
            )

        total_deposit = deposit_amount + advance_amount
        due_date = calculate_due_date(policy=policy, reference_date=now)
        deposit_type: Optional[DepositType] = (
            DepositType.ADVANCE if advance_amount > 0 else DepositType.CURRENT
        )

        deposit: Optional[Deposit] = Deposit(
            policy_id=req.policy_id,
            user_id=user_id,
            deposit_type=deposit_type,
            deposited_date=now,
            due_deposit_date=due_date,
            amount_paisa=MoneyMixin.rupees_to_paisa(alloc_total),
            verification_status=DepositVerificationStatus.PENDING,
        )
        session.add(deposit)
        session.flush()

        # Create Fine (if late)
        fine_id = None
        fine_amount_paisa = 0
        if fine_alloc > 0:
            fine_amount_paisa = MoneyMixin.rupees_to_paisa(fine_alloc)
            fine = Fine(
                user_id=user_id,
                deposit_id=deposit.id,
                amount_paisa=fine_amount_paisa,
                fine_type=FineType.DEPOSIT,
                date=now,
            )
            session.add(fine)
            fine_id = fine.id

        # Create Loan Payments
        loan_payment_ids: list[uuid.UUID] = []
        for la in loan_allocs:
            if not la.loan_id:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "loan_id is required for loan split allocations",
                )
            if la.amount_rupees <= 0:
                continue

            loan = session.get(Loan, la.loan_id)
            if not loan:
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND, f"Loan {la.loan_id} not found"
                )
            if loan.user_id != user_id:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, "Cannot pay someone else's loan"
                )

            paisa = MoneyMixin.rupees_to_paisa(la.amount_rupees)

            if la.category == SplitCategory.LOAN_RENEWAL:
                # Loan renewal: pay off remaining outstanding principal
                outstanding = loan.principal_paisa - loan.total_paid_paisa
                if outstanding < 0:
                    outstanding = 0
                if paisa < outstanding:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        f"Loan renewal requires at least {outstanding / 100} rupees "
                        f"to cover outstanding principal",
                    )
                # Create a PRINCIPAL payment for the outstanding amount
                payment = LoanPayment(
                    loan_id=la.loan_id,
                    payment_type=LoanPaymentType.PRINCIPAL,
                    amount_paisa=paisa,
                    date=now,
                )
                session.add(payment)
                loan_payment_ids.append(payment.id)

                loan.total_paid_paisa += paisa
                # Mark loan as PAID since the full principal is covered
                if loan.total_paid_paisa >= loan.principal_paisa:
                    loan.status = LoanStatus.PAID
                session.add(loan)
            else:
                # Regular loan principal or interest payment
                payment_type = (
                    LoanPaymentType.PRINCIPAL
                    if la.category == SplitCategory.LOAN_PRINCIPAL
                    else LoanPaymentType.INTEREST
                )

                payment = LoanPayment(
                    loan_id=la.loan_id,
                    payment_type=payment_type,
                    amount_paisa=paisa,
                    date=now,
                )
                session.add(payment)
                loan_payment_ids.append(payment.id)

                # Update loan totals
                loan.total_paid_paisa += paisa
                session.add(loan)

        # Commit everything
        session.commit()
        if deposit:
            session.refresh(deposit)

        total_allocated = sum(a.amount_rupees for a in req.allocations)

        return SmartDepositResponse(
            deposit_id=deposit.id if deposit else None,
            deposit_amount_paisa=deposit.amount_paisa if deposit else 0,
            deposit_type=deposit_type.value if deposit_type else None,
            fine_id=fine_id,
            fine_amount_paisa=fine_amount_paisa,
            loan_payment_ids=loan_payment_ids,
            total_allocated_rupees=total_allocated,
            message="Deposit created successfully",
        )

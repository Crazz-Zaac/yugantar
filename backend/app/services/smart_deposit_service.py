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
from app.models.loan_payment import LoanPayment, LoanPaymentType, LoanPaymentStatus
from app.models.mixins.money import MoneyMixin
from app.services.receipt_service import ReceiptService
from app.models.receipt_model import Receipt
from app.services.loan_service import service_charge_due_paisa
from app.services.policy_lifecycle import require_current_deposit_policy
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
    SmartDepositEditState,
)


class SmartDepositService:
    """Handles preview + execute for the smart-deposit flow."""

    def preview(
        self,
        session: Session,
        req: DepositPreviewRequest,
        user_id: uuid.UUID,
    ) -> DepositPreviewResponse:
        policy = require_current_deposit_policy(session, req.policy_id)

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
                    service_charge_due_paisa=service_charge_due_paisa(session, ln),
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
                    f"Your allocations add up to Rs. {alloc_total:,.0f}, but the deposit is Rs. {net_amount:,.0f}. They need to match.",
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
                SplitCategory.SERVICE_CHARGE,
            ):
                loan_allocs.append(a)

        if alloc_total <= 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Enter at least one amount for how this deposit should be applied.",
            )

        if not req.policy_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No deposit policy is selected. Please refresh the page and try again.",
            )

        policy = require_current_deposit_policy(session, req.policy_id)

        # The policy minimum applies to the *regular* (period) deposit only, not
        # to a voucher that is purely a fine or loan payment. When the member
        # makes a regular deposit it must meet the policy amount and, if late,
        # cover the late fine too. A fine allocation can never exceed the fine
        # actually due (loan allocations are validated further below).
        due_for_fine = calculate_due_date(policy=policy, reference_date=now)
        required = policy.amount_rupees
        fine_due = Decimal(0)
        if is_deposit_late(now, due_for_fine):
            fine_due = calculate_late_fine(
                deposited_date=now,
                due_deposit_date=due_for_fine,
                late_deposit_fine_percentage=policy.late_deposit_fine,
                amount_to_be_deposited=required,
            )

        if deposit_amount > 0:
            if deposit_amount + Decimal("1") < required:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"A regular deposit must be at least Rs. {required:,.0f} "
                    f"(you allocated Rs. {deposit_amount:,.0f} to Regular Deposit).",
                )
            if fine_due > 0 and fine_alloc + Decimal("1") < fine_due:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"This deposit is late — also allocate the Rs. {fine_due:,.0f} late deposit fine.",
                )

        if fine_alloc > fine_due + Decimal("1"):
            due_note = (
                " (this deposit is not late)" if fine_due == 0 else ""
            )
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"The late deposit fine due is Rs. {fine_due:,.0f}{due_note}. "
                f"You allocated Rs. {fine_alloc:,.0f}.",
            )

        receipt_id = None
        if req.receipt_id is not None:
            receipt_id = ReceiptService().claim_for_deposit(
                session, req.receipt_id, user_id
            ).id

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
            # The member's capital in this voucher (reports use these)
            regular_paisa=MoneyMixin.rupees_to_paisa(deposit_amount),
            advance_paisa=MoneyMixin.rupees_to_paisa(advance_amount),
            verification_status=DepositVerificationStatus.PENDING,
            receipt_id=receipt_id,
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
                    "Please choose which loan each loan payment is for.",
                )
            if la.amount_rupees <= 0:
                continue

            loan = session.get(Loan, la.loan_id)
            if not loan:
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND,
                    "One of the selected loans could not be found. Please refresh and try again.",
                )
            if loan.user_id != user_id:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, "You can only make payments toward your own loans."
                )
            if loan.status not in (LoanStatus.ACTIVE, LoanStatus.APPROVED):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Payments can only be made toward an active loan.",
                )

            paisa = MoneyMixin.rupees_to_paisa(la.amount_rupees)

            if la.category == SplitCategory.LOAN_RENEWAL:
                # Loan renewal: must cover the remaining outstanding principal
                outstanding = max(0, loan.principal_paisa - loan.total_paid_paisa)
                if paisa < outstanding:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        f"A loan renewal must cover the loan's full remaining amount of Rs. {outstanding / 100:,.0f}.",
                    )

            if la.category == SplitCategory.SERVICE_CHARGE:
                due = service_charge_due_paisa(session, loan)
                if loan.service_charge_method != "deposit" or due == 0:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        "This loan has no service charge left to pay with a deposit.",
                    )
                if paisa > due:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        f"You allocated more than the service charge left on this loan (Rs. {due / 100:,.2f}).",
                    )

            payment_type = (
                LoanPaymentType.INTEREST
                if la.category == SplitCategory.LOAN_INTEREST
                else LoanPaymentType.SERVICE_CHARGE
                if la.category == SplitCategory.SERVICE_CHARGE
                else LoanPaymentType.PRINCIPAL
            )

            # Payments stay PENDING and do not touch the loan's totals until
            # a reviewer verifies the deposit (see DepositService.verify_deposit).
            payment = LoanPayment(
                loan_id=la.loan_id,
                deposit_id=deposit.id,
                payment_type=payment_type,
                amount_paisa=paisa,
                date=now,
                status=LoanPaymentStatus.PENDING,
            )
            session.add(payment)
            loan_payment_ids.append(payment.id)

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
            message="Deposit submitted; awaiting treasurer verification",
        )

    def _require_editable(
        self, session: Session, deposit_id: uuid.UUID, user_id: uuid.UUID
    ) -> Deposit:
        deposit = session.get(Deposit, deposit_id)
        if not deposit or deposit.user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Deposit not found")
        if deposit.verification_status != DepositVerificationStatus.PENDING:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Only pending deposits can be edited",
            )
        return deposit

    def get_edit_state(
        self, session: Session, deposit_id: uuid.UUID, user_id: uuid.UUID
    ) -> SmartDepositEditState:
        """Reconstruct a pending deposit's full split so the form can be
        pre-populated for editing. Allocations live across the Deposit itself
        (regular/advance), a linked Fine, and linked LoanPayments."""
        deposit = self._require_editable(session, deposit_id, user_id)

        allocations: list[SmartDepositAllocation] = []
        regular = Decimal(deposit.regular_paisa or 0) / 100
        advance = Decimal(deposit.advance_paisa or 0) / 100
        if regular > 0:
            allocations.append(
                SmartDepositAllocation(category=SplitCategory.DEPOSIT, amount_rupees=regular)
            )
        if advance > 0:
            allocations.append(
                SmartDepositAllocation(
                    category=SplitCategory.ADVANCE_DEPOSIT, amount_rupees=advance
                )
            )

        fine = session.exec(select(Fine).where(Fine.deposit_id == deposit.id)).first()
        if fine and fine.amount_paisa:
            allocations.append(
                SmartDepositAllocation(
                    category=SplitCategory.FINE, amount_rupees=Decimal(fine.amount_paisa) / 100
                )
            )

        # LoanPayment has no RENEWAL type (renewal is stored as PRINCIPAL), so a
        # principal payment comes back as loan_principal; the member can switch
        # it to renewal on the row if needed.
        cat_by_type = {
            LoanPaymentType.INTEREST: SplitCategory.LOAN_INTEREST,
            LoanPaymentType.SERVICE_CHARGE: SplitCategory.SERVICE_CHARGE,
            LoanPaymentType.PRINCIPAL: SplitCategory.LOAN_PRINCIPAL,
        }
        payments = session.exec(
            select(LoanPayment).where(LoanPayment.deposit_id == deposit.id)
        ).all()
        for p in payments:
            allocations.append(
                SmartDepositAllocation(
                    category=cat_by_type.get(p.payment_type, SplitCategory.LOAN_PRINCIPAL),
                    amount_rupees=Decimal(p.amount_paisa) / 100,
                    loan_id=p.loan_id,
                )
            )

        receipt = (
            session.get(Receipt, deposit.receipt_id) if deposit.receipt_id else None
        )
        ocr_charge = (
            Decimal(receipt.ocr_charge_paisa) / 100
            if receipt and receipt.ocr_charge_paisa
            else Decimal(0)
        )

        return SmartDepositEditState(
            deposit_id=deposit.id,
            policy_id=deposit.policy_id,
            ocr_amount=Decimal(deposit.amount_paisa) / 100,
            ocr_charge=ocr_charge,
            ocr_date=deposit.deposited_date,
            ocr_reference=receipt.reference if receipt else None,
            receipt_id=deposit.receipt_id,
            allocations=allocations,
        )

    def replace(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        req: SmartDepositCreate,
        user_id: uuid.UUID,
    ) -> SmartDepositResponse:
        """Edit a pending deposit by replacing it: delete the old deposit and
        its linked fine + loan payments (which frees the receipt), then run the
        normal create path with the new split. Everything stays in one
        transaction, so a validation error leaves the original deposit intact."""
        deposit = self._require_editable(session, deposit_id, user_id)

        for p in session.exec(
            select(LoanPayment).where(LoanPayment.deposit_id == deposit.id)
        ).all():
            session.delete(p)
        for f in session.exec(select(Fine).where(Fine.deposit_id == deposit.id)).all():
            session.delete(f)
        session.delete(deposit)
        session.flush()

        return self.execute(session, req, user_id)

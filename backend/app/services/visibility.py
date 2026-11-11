"""
Who can see which financial records.

The cooperative is a closed group and is deliberately transparent: every
member can see other members' approved/active/paid loans and verified
deposits and loan payments in full. Records that are still PENDING or were
REJECTED (applications under review, rejection reasons, unverified money)
are only visible to their owner and to office bearers
(President, Treasurer, Secretary; see services/duties.py).
"""

from app.models.deposit_model import Deposit, DepositVerificationStatus
from app.models.loan_model import Loan, LoanStatus
from app.models.loan_payment import LoanPayment, LoanPaymentStatus
from app.models.user_model import User
from app.services.duties import is_office_bearer

PUBLIC_LOAN_STATUSES = {LoanStatus.APPROVED, LoanStatus.ACTIVE, LoanStatus.PAID}


def can_view_loan(user: User, loan: Loan) -> bool:
    return (
        loan.user_id == user.id
        or is_office_bearer(user)
        or loan.status in PUBLIC_LOAN_STATUSES
    )


def can_view_all_payments_of(user: User, loan: Loan) -> bool:
    """Owner and office bearers also see pending/rejected payments."""
    return loan.user_id == user.id or is_office_bearer(user)


def can_view_loan_payment(user: User, payment: LoanPayment, loan: Loan) -> bool:
    if can_view_all_payments_of(user, loan):
        return True
    return payment.status == LoanPaymentStatus.VERIFIED and can_view_loan(user, loan)


def can_view_deposit(user: User, deposit: Deposit) -> bool:
    return (
        deposit.user_id == user.id
        or is_office_bearer(user)
        or deposit.verification_status == DepositVerificationStatus.VERIFIED
    )

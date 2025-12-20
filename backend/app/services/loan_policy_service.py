import uuid
from typing import Optional, TypeVar
from sqlmodel import Session, select
from fastapi import HTTPException, status

from app.schemas.policy.loan_policy_schema import (
    LoanPolicyCreate,
    LoanPolicyUpdate,
)
from app.models.policy.loan_policy import LoanPolicy
from app.services.policy_service import PolicyService


class LoanPolicyService(PolicyService):
    """
    Service class for managing loan policies.
    """

    T = TypeVar("T", bound=LoanPolicy)

    def create_loan_policy(
        self,
        session: Session,
        policy_in: LoanPolicyCreate,
        created_by: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> LoanPolicy:
        policy_data = policy_in.model_dump(mode="json")
        new_policy = LoanPolicy(**policy_data)

        return PolicyService.create_policy(
            db_session=session,
            policy=new_policy,
            created_by=created_by,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def update_loan_policy(
        self,
        session: Session,
        policy_id: uuid.UUID,
        policy_in: LoanPolicyUpdate,
        updated_by: str,
        change_reason: str,
        ip_address: Optional[str] = None,
    ) -> LoanPolicy:
        """
        Update an existing loan policy.
        """

        statement = select(LoanPolicy).where(LoanPolicy.policy_id == policy_id)
        db_policy = session.exec(statement).first()

        if not db_policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan policy not found",
            )

        if not change_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Change reason is required for updating the policy",
            )

        policy_data = policy_in.model_dump(exclude_unset=True, mode="json")
        updated_policy = PolicyService.update_policy(
            db_session=session,
            policy_class=LoanPolicy,
            policy_id=policy_id,
            updated_data=policy_data,
            change_reason=change_reason,
            ip_address=ip_address,
            updated_by=updated_by,
        )

        return updated_policy

    
    # -----------------------------
    # Deactivate Policy
    # -----------------------------
    def deactivate_loan_policy(
        self,
        session: Session,
        policy_id: uuid.UUID,
        deactivated_by: str,
        change_reason: str,
        ip_address: Optional[str] = None,
    ) -> LoanPolicy:
        """
        Deactivate a loan policy.
        """

        statement = select(LoanPolicy).where(LoanPolicy.policy_id == policy_id)
        db_policy = session.exec(statement).first()

        if not db_policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan policy not found",
            )

        if not change_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Change reason must be provided for policy deactivation",
            )

        updated_data = {"is_active": False}
        deactivated_policy = PolicyService.update_policy(
            db_session=session,
            policy_class=LoanPolicy,
            policy_id=policy_id,
            updated_data=updated_data,
            change_reason=change_reason,
            ip_address=ip_address,
            updated_by=deactivated_by,
        )

        return deactivated_policy
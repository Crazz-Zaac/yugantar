import uuid
from typing import Optional, TypeVar
from sqlmodel import Session, select
from fastapi import HTTPException, status

from app.schemas.policy.deposit_policy_schema import (
    DepositPolicyCreate,
    DepositPolicyUpdate,
)
from app.models.policy.deposit_policy import DepositPolicy
from app.services.policy_service import PolicyService


class DepositPolicyService(PolicyService):
    """
    Service class for managing deposit policies.
    """

    T = TypeVar("T", bound=DepositPolicy)

    def create_deposit_policy(
        self,
        session: Session,
        policy_in: DepositPolicyCreate,
        created_by: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DepositPolicy:
        policy_data = policy_in.model_dump()
        new_policy = DepositPolicy(**policy_data)

        return PolicyService.create_policy(
            db_session=session,
            policy=new_policy,
            created_by=created_by,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def update_deposit_policy(
        self,
        session: Session,
        policy_id: uuid.UUID,
        policy_in: DepositPolicyUpdate,
        updated_by: str,
        change_reason: str,
        ip_address: Optional[str] = None,
    ) -> DepositPolicy:
        """
        Update an existing deposit policy.
        """

        statement = select(DepositPolicy).where(DepositPolicy.policy_id == policy_id)
        db_policy = session.exec(statement).first()

        if not db_policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit policy not found",
            )

        if not change_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Change reason must be provided for policy updates",
            )

        policy_data = policy_in.model_dump(exclude_unset=True)
        updated_policy = PolicyService.update_policy(
            db_session=session,
            policy_class=DepositPolicy,
            policy_id=policy_id,
            ip_address=ip_address,
            updated_data=policy_data,
            change_reason=change_reason,
            updated_by=updated_by,
        )

        return updated_policy

    def deactivate_deposit_policy(
        self,
        session: Session,
        policy_id: uuid.UUID,
        deactivated_by: str,
        change_reason: str,
        ip_address: Optional[str] = None,
    ) -> DepositPolicy:
        """
        Deactivate a deposit policy.
        """

        statement = select(DepositPolicy).where(DepositPolicy.policy_id == policy_id)
        db_policy = session.exec(statement).first()

        if not db_policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit policy not found",
            )
        
        if not change_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Change reason must be provided for policy deactivation",
            )

        updated_policy = PolicyService.deactivate_policy(
            db_session=session,
            policy_class=DepositPolicy,
            policy_id=policy_id,
            ip_address=ip_address,
            deactivated_by=deactivated_by,
            change_reason=change_reason,
        )

        return updated_policy
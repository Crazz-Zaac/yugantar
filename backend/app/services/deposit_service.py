import uuid
from typing import Optional
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.policy.deposit_policy import DepositPolicy
from app.models.deposit_model import Deposit, DepositVerificationStatus
from app.schemas.deposit_schema import (
    DepositCreate,
    DepositUserUpdate,
    DepositModeratorUpdate,
)
from app.models.user_model import User, CooperativeRole


class DepositService:
    """
    Service class for managing deposits.
    """

    def create_deposit(
        self,
        session: Session,
        deposit_in: DepositCreate,
        user_id: uuid.UUID,
    ) -> Deposit:
        deposit_data = deposit_in.model_dump(exclude={"receipt_screenshot"})
        new_deposit = Deposit(
            **deposit_data,
            user_id=user_id,
        )

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

        deposit_data = deposit_in.model_dump(exclude_unset=True)
        for key, value in deposit_data.items():
            setattr(db_deposit, key, value)

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
        Moderator update for an existing deposit.
        """

        if CooperativeRole.SECRETARY not in current_user.access_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )
        deposit = session.get(Deposit, deposit_id)
        if not deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )

        if deposit.verification_status == DepositVerificationStatus.VERIFIED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deposit already verified",
            )

        deposit.verification_status = deposit_in.verification_status
        deposit.verified_by = f"{current_user.first_name} {current_user.last_name}"
        session.add(deposit)
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

        if deposit.verification_status == DepositVerificationStatus.VERIFIED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete a verified deposit",
            )
        session.delete(deposit)
        session.commit()

    def moderator_delete_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        current_user: User,
    ) -> None:
        """
        Delete a deposit by its ID.
        """

        if CooperativeRole.SECRETARY not in current_user.access_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )

        deposit = session.get(Deposit, deposit_id)
        if not deposit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deposit not found",
            )

        session.delete(deposit)
        session.commit()

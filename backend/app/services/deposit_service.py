import uuid
from typing import Optional
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.policy.deposit_policy import DepositPolicy
from app.models.deposit_model import Deposit, DepositType
from app.schemas.deposit_schema import DepositCreate, DepositUpdate


class DepositService:
    """
    Service class for managing deposits.
    """
    
    def create_deposit(
        self,
        session: Session,
        deposit_in: DepositCreate,
    ) -> Deposit:
        deposit_data = deposit_in.model_dump()
        new_deposit = Deposit(**deposit_data)

        session.add(new_deposit)
        session.commit()
        session.refresh(new_deposit)

        return new_deposit
    
    def update_deposit(
        self,
        session: Session,
        deposit_id: uuid.UUID,
        deposit_in: DepositUpdate,
    ) -> Deposit:
        """
        Update an existing deposit.
        """

        statement = select(Deposit).where(Deposit.id == deposit_id)
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
    
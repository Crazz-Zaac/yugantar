import uuid
from typing import Optional
from sqlmodel import SQLModel, Field
from fastapi import HTTPException, status
from sqlmodel import Session, select
from datetime import datetime, timezone


from app.models.receipt_model import Receipt
from app.schemas.receipt_schema import ReceiptCreate, ReceiptUpdate
from app.models.user_model import User


class ReceiptService:
    """
    Service class for managing receipts.
    """

    def create_receipt(
        self,
        session: Session,
        receipt_in: ReceiptCreate,
    ) -> Receipt:
        receipt_data = receipt_in.model_dump()
        new_receipt = Receipt(**receipt_data)

        session.add(new_receipt)
        session.commit()
        session.refresh(new_receipt)

        return new_receipt

    def update_receipt(
        self,
        session: Session,
        receipt_id: uuid.UUID,
        receipt_in: ReceiptUpdate,
    ) -> Receipt:
        db_receipt = self.get_receipt(session, receipt_id)

        receipt_data = receipt_in.model_dump(exclude_unset=True)
        for key, value in receipt_data.items():
            setattr(db_receipt, key, value)

        session.add(db_receipt)
        session.commit()
        session.refresh(db_receipt)

        return db_receipt

    def get_receipt(
        self,
        session: Session,
        receipt_id: uuid.UUID,
    ) -> Receipt:
        statement = select(Receipt).where(Receipt.id == receipt_id)
        db_receipt = session.exec(statement).first()

        if not db_receipt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found",
            )

        return db_receipt

    def delete_receipt(
        self,
        session: Session,
        receipt_id: uuid.UUID,
    ) -> None:
        db_receipt = self.get_receipt(session, receipt_id)

        session.delete(db_receipt)
        session.commit()
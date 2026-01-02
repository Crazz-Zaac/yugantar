import uuid
from typing import Optional
from sqlmodel import SQLModel, Field
from fastapi import HTTPException, status
from sqlmodel import Session, select
from datetime import datetime, timezone

from app.models.fine_model import Fine
from app.schemas.fine_schema import FineBase


class FineService:
    """
    Service class for managing fines.
    """

    def create_fine(
        self,
        session: Session,
        fine_in: FineBase,
    ) -> Fine:
        fine_data = fine_in.model_dump()
        new_fine = Fine(**fine_data)

        session.add(new_fine)
        session.commit()
        session.refresh(new_fine)

        return new_fine

    def get_fine(
        self,
        session: Session,
        fine_id: uuid.UUID,
    ) -> Fine:
        statement = select(Fine).where(Fine.id == fine_id)
        db_fine = session.exec(statement).first()

        if not db_fine:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fine not found",
            )

        return db_fine

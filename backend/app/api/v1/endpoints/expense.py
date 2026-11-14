"""Expenses (see services/expense_service.py)."""

import uuid
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlmodel import Session

from app.api.dependencies.auth import get_current_user
from app.core.db import get_session
from app.models.user_model import User
from app.schemas.expense_schema import ExpenseCreate, ExpenseList, ExpenseOut, ExpenseReject, ExpenseVoid
from app.services.expense_service import ExpenseService, to_out

router = APIRouter(prefix="/expenses", tags=["expenses"])
service = ExpenseService()


def _out(session: Session, viewer: User, e) -> ExpenseOut:
    return to_out(e, viewer, session.get(User, e.recorded_by))


@router.get("", response_model=ExpenseList)
def list_expenses(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    status_filter: Optional[Literal["pending", "approved", "rejected"]] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return service.list(session, current_user, date_from, date_to, status_filter)


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def record_expense(
    data: ExpenseCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _out(session, current_user, service.create(session, current_user, data, background_tasks))


@router.post("/{expense_id}/approve", response_model=ExpenseOut)
def approve_expense(
    expense_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _out(session, current_user, service.approve(session, current_user, expense_id, background_tasks))


@router.post("/{expense_id}/reject", response_model=ExpenseOut)
def reject_expense(
    expense_id: uuid.UUID,
    data: ExpenseReject,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _out(session, current_user, service.reject(session, current_user, expense_id, data, background_tasks))


@router.post("/{expense_id}/void", response_model=ExpenseOut)
def void_expense(
    expense_id: uuid.UUID,
    data: ExpenseVoid,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _out(session, current_user, service.void(session, current_user, expense_id, data))

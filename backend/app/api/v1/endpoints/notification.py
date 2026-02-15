from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from uuid import UUID

from app.core.db import get_session
from app.models.notification_model import Notification
from app.schemas.notification_schema import NotificationResponse
from app.api.dependencies.auth import get_current_user
from app.models.user_model import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get(
    "",
    response_model=List[NotificationResponse],
    status_code=status.HTTP_200_OK,
)
def list_notifications(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all notifications for the current user, newest first.
    """
    statement = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    notifications = session.exec(statement).all()
    return notifications


@router.patch(
    "/read-all",
    status_code=status.HTTP_200_OK,
)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Mark all notifications as read for the current user.
    """
    statement = select(Notification).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    )
    unread = session.exec(statement).all()
    for n in unread:
        n.is_read = True
        session.add(n)
    session.commit()
    return {"marked_read": len(unread)}


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    status_code=status.HTTP_200_OK,
)
def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Mark a notification as read.
    """
    statement = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    )
    notification = session.exec(statement).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    notification.is_read = True
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification

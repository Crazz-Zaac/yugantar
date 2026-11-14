"""Meeting minutes (see services/minutes_service.py)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response, status
from sqlmodel import Session

from app.api.dependencies.auth import get_current_user
from app.core.db import get_session
from app.models.user_model import User
from app.schemas.meeting_minutes_schema import (
    DeclineIn,
    MinutesIn,
    MinutesList,
    MinutesOut,
    Prefill,
    ResolutionOut,
    ReturnIn,
    SignIn,
)
from app.services.minutes_service import MinutesService

router = APIRouter(prefix="/minutes", tags=["meeting minutes"])
service = MinutesService()


@router.get("", response_model=MinutesList)
def list_minutes(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return service.list(session, current_user)


@router.get("/resolutions", response_model=list[ResolutionOut])
def resolutions_register(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Every resolution voted on in approved minutes."""
    return service.resolutions(session, current_user)


@router.get("/prefill", response_model=Prefill)
def prefill(
    event_id: uuid.UUID = Query(...),
    occurrence: datetime = Query(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return service.prefill(session, current_user, event_id, occurrence)


@router.get("/{minutes_id}", response_model=MinutesOut)
def get_minutes(minutes_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return service.get(session, current_user, minutes_id)


@router.post("", response_model=MinutesOut, status_code=status.HTTP_201_CREATED)
def create_minutes(data: MinutesIn, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return service.to_out(session, current_user, service.create(session, current_user, data))


@router.put("/{minutes_id}", response_model=MinutesOut)
def update_minutes(
    minutes_id: uuid.UUID, data: MinutesIn,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    return service.to_out(session, current_user, service.update(session, current_user, minutes_id, data))


@router.post("/{minutes_id}/submit", response_model=MinutesOut)
def submit_minutes(
    minutes_id: uuid.UUID, background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    return service.to_out(session, current_user, service.submit(session, current_user, minutes_id, background_tasks))


@router.post("/{minutes_id}/approve", response_model=MinutesOut)
def approve_minutes(
    minutes_id: uuid.UUID, background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    return service.to_out(session, current_user, service.approve(session, current_user, minutes_id, background_tasks))


@router.post("/{minutes_id}/return", response_model=MinutesOut)
def return_minutes(
    minutes_id: uuid.UUID, data: ReturnIn, background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    return service.to_out(session, current_user,
                          service.return_to_draft(session, current_user, minutes_id, data, background_tasks))


@router.post("/{minutes_id}/sign", response_model=MinutesOut)
def sign_minutes(
    minutes_id: uuid.UUID, data: SignIn, background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    """An attendee signs approved minutes (hand signature)."""
    return service.to_out(session, current_user,
                          service.sign(session, current_user, minutes_id, data.signature_image, background_tasks))


@router.post("/{minutes_id}/decline", response_model=MinutesOut)
def decline_minutes(
    minutes_id: uuid.UUID, data: DeclineIn, background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    """An attendee declines to sign, with a reason (e.g. the minutes are wrong)."""
    return service.to_out(session, current_user,
                          service.decline(session, current_user, minutes_id, data.reason, background_tasks))


@router.get("/{minutes_id}/signatures/{user_id}/image")
def signature_image(
    minutes_id: uuid.UUID, user_id: uuid.UUID,
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    return Response(content=service.signature_image(session, current_user, minutes_id, user_id),
                    media_type="image/png", headers={"Cache-Control": "private, max-age=300"})


@router.get("/{minutes_id}/pdf")
def minutes_pdf(minutes_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    m, data = service.pdf(session, current_user, minutes_id)
    return Response(content=data, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{(m.reference or "minutes").replace("/", "-")}.pdf"',
        "Cache-Control": "no-store",
    })

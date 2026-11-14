"""Calendar events and online meetings (see services/calendar_service.py)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status
from sqlmodel import Session

from app import i18n
from app.api.dependencies.auth import get_current_user
from app.core.db import get_session
from app.models.user_model import User
from app.schemas.calendar_schema import (
    CalendarFeed,
    EventCreate,
    EventUpdate,
    JoinInfo,
    MeetNowRequest,
    RsvpPerson,
    RsvpRequest,
)
from app.services.calendar_service import CalendarService

router = APIRouter(prefix="/calendar", tags=["calendar"])
service = CalendarService()


def _created(event) -> dict:
    return {"id": str(event.id), "start_at": event.start_at, "end_at": event.end_at}


@router.get("/events", response_model=CalendarFeed)
def list_events(
    request: Request,
    start: datetime = Query(..., description="Range start (ISO, with timezone)"),
    end: datetime = Query(..., description="Range end (ISO, with timezone), at most 120 days after start"),
    online: bool = Query(False, description="Online meetings only"),
    due_dates: bool = Query(True, description="Include deposit / loan / policy due dates"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return service.feed(session, current_user, start, end, i18n.request_lang(request), online, due_dates)


@router.get("/upcoming", response_model=CalendarFeed)
def upcoming(
    request: Request,
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The next few items (Home tab)."""
    return service.upcoming(session, current_user, i18n.request_lang(request), limit)


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(
    data: EventCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _created(service.create(session, current_user, data, background_tasks))


@router.post("/meet-now", status_code=status.HTTP_201_CREATED)
def meet_now(
    data: MeetNowRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Start an online meeting right now (office bearers)."""
    return _created(service.meet_now(session, current_user, data, background_tasks))


@router.put("/events/{event_id}")
def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _created(service.update(session, current_user, event_id, data, background_tasks))


@router.post("/events/{event_id}/cancel")
def cancel_event(
    event_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    service.cancel(session, current_user, event_id, background_tasks)
    return {"cancelled": True}


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_personal_event(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Delete one of my personal events."""
    service.delete_personal(session, current_user, event_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/events/{event_id}/rsvp", status_code=status.HTTP_204_NO_CONTENT)
def rsvp(
    event_id: uuid.UUID,
    data: RsvpRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    service.set_rsvp(session, current_user, event_id, data)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/events/{event_id}/rsvps", response_model=list[RsvpPerson])
def rsvp_people(
    event_id: uuid.UUID,
    occurrence: datetime = Query(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Who replied Going / Maybe / Can't go to one occurrence."""
    return service.rsvp_people(session, current_user, event_id, occurrence)


@router.post("/events/{event_id}/join", response_model=JoinInfo)
def join_meeting(
    event_id: uuid.UUID,
    response: Response,
    occurrence: datetime = Query(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """A one-person meeting token (JaaS) for an online event that is open now."""
    response.headers["Cache-Control"] = "no-store"
    return service.join(session, current_user, event_id, occurrence)


@router.get("/events/{event_id}/ics")
def event_ics(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The event as a calendar file (.ics) for phone calendars."""
    body = service.ics(session, current_user, event_id)
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="yugantar-event-{str(event_id)[:8]}.ics"',
            "Cache-Control": "no-store",
        },
    )

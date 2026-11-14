from celery.utils.log import get_task_logger

from ..celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="send_event_reminders")
def send_event_reminders() -> int:
    """In-app + email reminder shortly before each timed calendar event or
    online meeting (EVENT_REMINDER_MINUTES). Runs every 5 minutes."""
    from sqlmodel import Session

    from app.core.db import engine
    from app.services.calendar_service import CalendarService

    with Session(engine) as session:
        sent = CalendarService().send_reminders(session)
    if sent:
        logger.info(f"Sent reminders for {sent} event(s)")
    return sent

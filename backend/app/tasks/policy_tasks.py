from celery.utils.log import get_task_logger

from ..celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="close_policy_signings")
def close_policy_signings() -> int:
    """Close open policies whose 1-week signing deadline has passed:
    ACTIVE if every member signed, otherwise lapsed (VOID). Runs hourly."""
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.policy_signing_service import PolicySigningService

    with Session(engine) as session:
        closed = PolicySigningService().close_due_policies(session)
    logger.info(f"Closed {closed} policy signing round(s)")
    return closed

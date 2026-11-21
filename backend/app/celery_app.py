from celery import Celery
from celery.schedules import crontab
import os


celery_app = Celery(
    "backend",
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
)

celery_app.autodiscover_tasks(["app.tasks"])

# Hourly, so images are removed within an hour of their expiry
celery_app.conf.beat_schedule = {
    "purge-expired-receipts": {
        "task": "purge_expired_receipts",
        "schedule": crontab(minute=0),
    },
    # Policy signing deadlines: decide outcome within an hour of the deadline
    "close-policy-signings": {
        "task": "close_policy_signings",
        "schedule": crontab(minute=5),
    },
    # "Starting soon" reminders for calendar events and meetings
    "send-event-reminders": {
        "task": "send_event_reminders",
        "schedule": crontab(minute="*/5"),
    },
}


# Background tasks run as a trusted system principal so Row-Level Security
# does not block them (they operate on behalf of the whole cooperative, not
# one member). The principal is cleared when each task finishes.
from celery.signals import task_prerun, task_postrun  # noqa: E402
from app.core import rls  # noqa: E402


@task_prerun.connect
def _rls_set_system_principal(*args, **kwargs):
    rls.set_system_principal()


@task_postrun.connect
def _rls_clear_principal(*args, **kwargs):
    rls.clear_principal()

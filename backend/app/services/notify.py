"""
In-app notifications and emails, in each person's language.

`notify()` stores one Notification per user with the English text plus the
message key and values (so the app can show it in the reader's language), and
emails each user in their saved language (User.preferred_language).
"""

from datetime import datetime
from decimal import Decimal
from typing import Iterable, Optional
import uuid

from fastapi import BackgroundTasks
from fastapi_mail import NameEmail
from sqlmodel import Session

from app import i18n
from app.models.notification_model import Notification, NotificationType
from app.models.user_model import User
from app.services.email_notify import send_generic_email


def _jsonable(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def notify(
    session: Session,
    background_tasks: Optional[BackgroundTasks],
    users: Iterable[User],
    key: str,
    ntype: NotificationType,
    *,
    loan_id: Optional[uuid.UUID] = None,
    policy_type: Optional[str] = None,
    policy_id: Optional[uuid.UUID] = None,
    in_app: bool = True,
    send_email: bool = True,
    commit: bool = False,
    **args,
) -> None:
    """Notify `users` with catalogue message `key` (see app/i18n.py)."""
    values = {k: _jsonable(v) for k, v in args.items()}
    title_en, message_en = i18n.render(key, "en", values)
    for user in users:
        if user is None:
            continue
        if in_app:
            session.add(
                Notification(
                    user_id=user.id,
                    title=title_en[:200],
                    message=message_en[:1000],
                    notification_type=ntype,
                    loan_id=loan_id,
                    policy_type=policy_type,
                    policy_id=policy_id,
                    i18n_key=key,
                    i18n_args=values,
                )
            )
        if send_email and background_tasks is not None and user.email:
            subject, body = i18n.render_email(key, user.preferred_language, user.first_name, values)
            background_tasks.add_task(
                send_generic_email, [NameEmail(name=user.first_name, email=user.email)], subject, body
            )
    if commit:
        session.commit()


def notification_text(n: Notification, lang: str) -> tuple[str, str]:
    """A stored notification's (title, message) in `lang`."""
    if n.i18n_key and n.i18n_key in i18n.MESSAGES and lang != "en":
        try:
            return i18n.render(n.i18n_key, lang, n.i18n_args or {})
        except (KeyError, ValueError, IndexError):
            pass
    return n.title, n.message

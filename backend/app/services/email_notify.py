from app.core.config import settings
from fastapi_mail import (
    FastMail,
    MessageSchema,
    ConnectionConfig,
    MessageType,
    NameEmail,
)
from typing import List
import ssl
from loguru import logger


# To ignore SSL certificate verification (useful for development/testing)
ssl._create_default_https_context = ssl._create_unverified_context


async def send_registration_notification(
    email_to: List[NameEmail], username: str
) -> None:
    """
    Send registration notification email to the user.
    """
    conf = ConnectionConfig(
        MAIL_USERNAME=settings.SMTP_USER,
        MAIL_PASSWORD=settings.SMTP_PASSWORD,
        MAIL_FROM_NAME=settings.EMAILS_FROM_NAME,
        MAIL_FROM=settings.EMAILS_FROM_EMAIL,
        MAIL_SERVER=settings.SMTP_SERVER,
        MAIL_PORT=settings.SMTP_PORT,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )

    try:
        message = MessageSchema(
            subject="Welcome to Yugantar - Your Account Details",
            recipients=email_to,
            body=f"Hello {username},\n\n"
            f"Welcome to Yugantar! Your account has been successfully created.\n\n"
            f"Best regards,\n"
            f"The Yugantar Team",
            subtype=MessageType.plain,
        )

        fm = FastMail(conf)
        await fm.send_message(message)
    except Exception as e:
        logger.error(f"Failed to send registration email: {e}")


async def send_password_reset_email(email_to: List[NameEmail], reset_link: str) -> None:
    """
    Send password reset email to the user.
    """
    conf = ConnectionConfig(
        MAIL_USERNAME=settings.SMTP_USER,
        MAIL_PASSWORD=settings.SMTP_PASSWORD,
        MAIL_FROM_NAME=settings.EMAILS_FROM_NAME,
        MAIL_FROM=settings.EMAILS_FROM_EMAIL,
        MAIL_SERVER=settings.SMTP_SERVER,
        MAIL_PORT=settings.SMTP_PORT,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
    )

    try:
        message = MessageSchema(
            subject="Yugantar Password Reset Request",
            recipients=email_to,
            body=f"Hello,\n\n"
            f"We received a request to reset your password. "
            f"Please click the link below to reset your password:\n\n"
            f"{reset_link}\n\n"
            f"If you did not request a password reset, please ignore this email.\n\n"
            f"Best regards,\n"
            f"The Yugantar Team",
            subtype=MessageType.plain,
        )

        fm = FastMail(conf)
        await fm.send_message(message)
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")


async def send_generic_email(
    email_to: List[NameEmail], subject: str, body: str
) -> None:
    """
    Send a generic email to the user.
    """
    conf = ConnectionConfig(
        MAIL_USERNAME=settings.SMTP_USER,
        MAIL_PASSWORD=settings.SMTP_PASSWORD,
        MAIL_FROM_NAME=settings.EMAILS_FROM_NAME,
        MAIL_FROM=settings.EMAILS_FROM_EMAIL,
        MAIL_SERVER=settings.SMTP_SERVER,
        MAIL_PORT=settings.SMTP_PORT,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
    )

    try:
        message = MessageSchema(
            subject=subject,
            recipients=email_to,
            body=body,
            subtype=MessageType.plain,
        )

        fm = FastMail(conf)
        await fm.send_message(message)
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

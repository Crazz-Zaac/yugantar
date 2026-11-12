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


_REG_TEXT = {
    "en": {
        "subject": "Account Registration Successful",
        "hello": "Hello {username},",
        "welcome": "Welcome to Yugantar! Your account has been successfully created.",
        "next": "The next thing is to verify your email to activate your account and access all features.",
        "click": "Please click the button below to verify your email address:",
        "button": "Verify Email",
        "copy": "Or copy and paste this link into your browser:",
        "expiry": "This link will expire in 24 hours.",
        "regards": "Best regards,<br>Yugantar Admin",
    },
    "ne": {
        "subject": "खाता दर्ता सफल भयो",
        "hello": "नमस्ते {username},",
        "welcome": "युगान्तरमा स्वागत छ! तपाईंको खाता सफलतापूर्वक बनाइएको छ।",
        "next": "अब खाता सक्रिय गर्न र सबै सुविधा प्रयोग गर्न आफ्नो इमेल प्रमाणित गर्नुहोस्।",
        "click": "इमेल ठेगाना प्रमाणित गर्न तलको बटन थिच्नुहोस्:",
        "button": "इमेल प्रमाणित गर्नुहोस्",
        "copy": "वा यो लिङ्क ब्राउजरमा टाँस्नुहोस्:",
        "expiry": "यो लिङ्कको म्याद २४ घण्टामा सकिन्छ।",
        "regards": "शुभकामना सहित,<br>युगान्तर एडमिन",
    },
}

_RESET_TEXT = {
    "en": (
        "Password Reset Request",
        "Hello,\n\nWe received a request to reset your password. Please click the link below to reset your "
        "password:\n\n{link}\n\nIf you did not request a password reset, please ignore this email.\n\n"
        "Best regards,\nThe Yugantar Team",
    ),
    "ne": (
        "पासवर्ड रिसेट अनुरोध",
        "नमस्ते,\n\nतपाईंको पासवर्ड रिसेट गर्ने अनुरोध प्राप्त भयो। पासवर्ड रिसेट गर्न तलको लिङ्कमा थिच्नुहोस्:\n\n"
        "{link}\n\nतपाईंले अनुरोध गर्नुभएको होइन भने यो इमेललाई बेवास्ता गर्नुहोस्।\n\nशुभकामना सहित,\nयुगान्तर टोली",
    ),
}


async def send_registration_notification(
    email_to: List[NameEmail], username: str, verification_link: str, lang: str = "en"
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
    
    t = _REG_TEXT.get(lang, _REG_TEXT["en"])
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>{t["hello"].format(username=username)}</h2>
            <p>{t["welcome"]}</p>
            <p>{t["next"]}</p>
            <p>{t["click"]}</p>
            <p style="margin: 30px 0;">
                <a href="{verification_link}"
                   style="background-color: #4CAF50;
                          color: white;
                          padding: 12px 24px;
                          text-decoration: none;
                          border-radius: 4px;
                          display: inline-block;">
                    {t["button"]}
                </a>
            </p>
            <p>{t["copy"]}</p>
            <p style="word-break: break-all; color: #0066cc;">{verification_link}</p>
            <p><small>{t["expiry"]}</small></p>
            <br>
            <p>{t["regards"]}</p>
        </body>
    </html>
    """

    try:
        message = MessageSchema(
            subject=t["subject"],
            recipients=email_to,
            body=html_content,  
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(message)
        logger.info(f"Registration email sent successfully to {email_to}")
    except Exception as e:
        logger.error(f"Failed to send registration email: {e}")
        raise

    print({"message": "Registration email sent successfully"})


async def send_password_reset_email(email_to: List[NameEmail], reset_link: str, lang: str = "en") -> None:
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
            subject=_RESET_TEXT.get(lang, _RESET_TEXT["en"])[0],
            recipients=email_to,
            body=_RESET_TEXT.get(lang, _RESET_TEXT["en"])[1].format(link=reset_link),
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

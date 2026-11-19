"""
Outgoing email: one branded HTML template for every message.

Each email is wrapped in `_shell()` — a header band with the organisation name,
the greeting and body, then a signature block (logo, the signer's name and role,
the organisation name and its contact email) and a small footer. The signer's
*name and role* reflect whoever the message is from (Treasurer, President,
Secretary, or Administration); the contact email and organisation name always
come from the Organization settings the Admin controls (services/organization_service.py).
"""

import html
import os
import ssl
from collections import namedtuple
from typing import List, Optional

from fastapi_mail import (
    ConnectionConfig,
    FastMail,
    MessageSchema,
    MessageType,
    NameEmail,
)
from loguru import logger
from sqlmodel import Session, select

from app.core.config import settings
from app.models.notification_model import NotificationType as NT
from app.models.user_model import CooperativeRole, User

# Ignore SSL certificate verification (useful for development/testing)
ssl._create_default_https_context = ssl._create_unverified_context

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "yugantar_logo.png")

# A message is "from" an office bearer (name) in a role, or from Administration.
Signer = namedtuple("Signer", ["name", "role"])  # role: a CooperativeRole value, or "admin"

# Which office each notification is "from"
_TREASURER = {
    NT.POLICY_APPROVAL, NT.POLICY_APPROVED, NT.POLICY_REJECTED, NT.POLICY_FINALIZED,
    NT.LOAN_APPLICATION, NT.LOAN_FUND_VERIFIED,
    NT.DEPOSIT_SUBMITTED, NT.DEPOSIT_VERIFIED, NT.DEPOSIT_REJECTED, NT.EXPENSE,
}
_PRESIDENT = {NT.LOAN_APPROVED, NT.LOAN_REJECTED}
_SECRETARY = {NT.MINUTES}

_ROLE_LABEL = {
    "en": {"treasurer": "Treasurer", "president": "President", "secretary": "Secretary", "admin": "Administration"},
    "ne": {"treasurer": "कोषाध्यक्ष", "president": "अध्यक्ष", "secretary": "सचिव", "admin": "प्रशासन"},
}
_GREETING = {"en": "Hello {name},", "ne": "नमस्ते {name},"}
_REGARDS = {"en": "Best regards,", "ne": "शुभकामना सहित,"}
_PORTAL = {
    "en": "Log in to the Yugantar portal for details.",
    "ne": "विस्तृत जानकारीका लागि युगान्तर पोर्टलमा लगइन गर्नुहोस्।",
}
_AUTO = {
    "en": "This is an automated message. Please do not reply to this email.",
    "ne": "यो स्वचालित सन्देश हो। कृपया यसको जवाफ नदिनुहोस्।",
}

# Brand colours (from the logo): deep blue header, orange name, blue links
_BLUE = "#1f3c88"
_LINK = "#3b6fd4"
_ORANGE = "#e8491d"


def _lang(lang: str) -> str:
    return "ne" if lang == "ne" else "en"


def signer_for(session: Session, ntype: NT) -> Optional[Signer]:
    """The office bearer a notification is from, or None for Administration."""
    role = (
        CooperativeRole.TREASURER.value if ntype in _TREASURER
        else CooperativeRole.PRESIDENT.value if ntype in _PRESIDENT
        else CooperativeRole.SECRETARY.value if ntype in _SECRETARY
        else None
    )
    if role is None:
        return None
    holder = next(
        (u for u in session.exec(select(User)).all() if role in (u.cooperative_roles or [])),
        None,
    )
    if holder is None:
        return None
    name = f"{holder.first_name} {holder.last_name}".strip()
    return Signer(name=name, role=role)


def _org() -> dict:
    """The organisation's details, loaded in a fresh session (emails run in the background)."""
    fallback = {
        "name": "Yugantar Cooperative",
        "email": str(settings.EMAILS_FROM_EMAIL or ""),
        "phone": "", "address": "", "website": "",
    }
    try:
        from app.core.db import engine
        from app.services.organization_service import get_org

        with Session(engine) as s:
            o = get_org(s)
            return {
                "name": o.name or fallback["name"],
                "email": o.email or fallback["email"],
                "phone": o.phone, "address": o.address, "website": o.website,
            }
    except Exception as e:  # noqa: BLE001 - never let a settings read block an email
        logger.warning(f"Organization settings unavailable for email: {e}")
        return fallback


def _conf() -> ConnectionConfig:
    return ConnectionConfig(
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


def _paras(message: str) -> str:
    """Plain catalogue text -> HTML paragraphs (escaped; blank line splits, newline breaks)."""
    blocks = [b for b in html.escape(message).split("\n\n") if b.strip()]
    return "".join(
        f'<p style="font-size:15px; line-height:1.6; color:#2b2b2b; margin:0 0 14px;">'
        f'{b.strip().replace(chr(10), "<br>")}</p>'
        for b in blocks
    )


def _button(label: str, url: str) -> str:
    return (
        f'<p style="margin:26px 0;"><a href="{html.escape(url)}" '
        f'style="background:{_BLUE}; color:#ffffff; padding:12px 26px; border-radius:6px; '
        f'text-decoration:none; display:inline-block; font-size:15px; font-weight:bold;">'
        f"{html.escape(label)}</a></p>"
    )


def _signature(signer: Optional[Signer], org: dict, lang: str) -> str:
    name, role_key = (org["name"], "admin") if signer is None else (signer.name, signer.role)
    role = _ROLE_LABEL[lang].get(role_key, role_key.title())
    logo = (
        f'<img src="cid:yglogo" width="84" alt="{html.escape(org["name"])}" '
        f'style="display:block; border:0;">'
        if os.path.exists(_LOGO_PATH) else ""
    )
    email_line = (
        f'<a href="mailto:{html.escape(org["email"])}" '
        f'style="font-size:13px; color:{_LINK}; text-decoration:underline;">{html.escape(org["email"])}</a>'
        if org["email"] else ""
    )
    return f"""
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td style="vertical-align:middle; padding-right:16px;">{logo}</td>
        <td style="vertical-align:middle; border-left:2px solid #222222; padding-left:16px;">
          <div style="font-size:17px; font-weight:bold; color:{_ORANGE};">{html.escape(name)}</div>
          <div style="font-size:14px; color:{_LINK}; margin-top:2px;">{html.escape(role)}</div>
          <div style="font-size:15px; font-weight:bold; color:#111111; margin-top:12px;">{html.escape(org["name"])}</div>
          {email_line}
        </td>
      </tr>
    </table>
    """


def _shell(first_name: str, inner_html: str, signer: Optional[Signer], org: dict, lang: str) -> str:
    greeting = html.escape(_GREETING[lang].format(name=first_name or ""))
    footer_bits = [org["name"]] + [b for b in (org["address"], org["phone"]) if b]
    footer = html.escape(" · ".join(footer_bits))
    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#f4f6f8;">
    <div style="background:#f4f6f8; padding:24px 12px; font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0"
                 style="max-width:600px; width:100%; background:#ffffff; border-radius:10px;
                        overflow:hidden; border:1px solid #e3e8ee;">
            <tr><td style="background:{_BLUE}; padding:18px 28px;">
              <span style="color:#ffffff; font-size:18px; font-weight:bold; letter-spacing:.3px;">
                {html.escape(org["name"])}</span>
            </td></tr>
            <tr><td style="padding:28px;">
              <p style="font-size:15px; color:#222222; margin:0 0 16px;">{greeting}</p>
              {inner_html}
              <p style="font-size:15px; color:#222222; margin:20px 0 0;">{html.escape(_REGARDS[lang])}</p>
              {_signature(signer, org, lang)}
            </td></tr>
            <tr><td style="background:#f0f2f5; padding:16px 28px; border-top:1px solid #e3e8ee;">
              <p style="font-size:12px; color:#7a8699; margin:0 0 4px;">{footer}</p>
              <p style="font-size:12px; color:#9aa6b6; margin:0;">{html.escape(_AUTO[lang])}</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </div>
  </body>
</html>"""


def _attachments() -> Optional[list]:
    if not os.path.exists(_LOGO_PATH):
        return None
    return [{
        "file": _LOGO_PATH,
        "headers": {
            "Content-ID": "<yglogo>",
            "Content-Disposition": 'inline; filename="yugantar_logo.png"',
        },
        "mime_type": "image",
        "mime_subtype": "png",
    }]


async def _send(email_to: List[NameEmail], subject: str, html_body: str) -> None:
    message = MessageSchema(
        subject=subject,
        recipients=email_to,
        body=html_body,
        subtype=MessageType.html,
        attachments=_attachments() or [],
    )
    await FastMail(_conf()).send_message(message)


async def send_registration_notification(
    email_to: List[NameEmail], username: str, verification_link: str, lang: str = "en"
) -> None:
    """Welcome email with the email-verification button."""
    lang = _lang(lang)
    org = _org()
    body = {
        "en": (
            "Welcome to Yugantar! Your account has been created. "
            "Verify your email address to activate it and access all features."
        ),
        "ne": (
            "युगान्तरमा स्वागत छ! तपाईंको खाता बनाइएको छ। "
            "यसलाई सक्रिय गर्न र सबै सुविधा प्रयोग गर्न आफ्नो इमेल ठेगाना प्रमाणित गर्नुहोस्।"
        ),
    }[lang]
    btn = {"en": "Verify email", "ne": "इमेल प्रमाणित गर्नुहोस्"}[lang]
    copy = {
        "en": "Or paste this link into your browser (it expires in 24 hours):",
        "ne": "वा यो लिङ्क ब्राउजरमा टाँस्नुहोस् (२४ घण्टामा म्याद सकिन्छ):",
    }[lang]
    inner = (
        _paras(body)
        + _button(btn, verification_link)
        + f'<p style="font-size:13px; color:#555; margin:0 0 6px;">{html.escape(copy)}</p>'
        + f'<p style="font-size:13px; word-break:break-all;"><a href="{html.escape(verification_link)}" '
        f'style="color:{_LINK};">{html.escape(verification_link)}</a></p>'
    )
    subject = {"en": "Verify your email — Yugantar", "ne": "इमेल प्रमाणित गर्नुहोस् — युगान्तर"}[lang]
    try:
        await _send(email_to, subject, _shell(username, inner, None, org, lang))
        logger.info(f"Registration email sent to {email_to}")
    except Exception as e:
        logger.error(f"Failed to send registration email: {e}")
        raise


async def send_password_reset_email(email_to: List[NameEmail], reset_link: str, lang: str = "en") -> None:
    """Password-reset email with the reset button."""
    lang = _lang(lang)
    org = _org()
    body = {
        "en": "We received a request to reset your password. Use the button below to choose a new one. "
              "If you didn't ask for this, you can ignore this email.",
        "ne": "तपाईंको पासवर्ड रिसेट गर्ने अनुरोध प्राप्त भयो। नयाँ पासवर्ड राख्न तलको बटन प्रयोग गर्नुहोस्। "
              "तपाईंले अनुरोध गर्नुभएको होइन भने यो इमेललाई बेवास्ता गर्नुहोस्।",
    }[lang]
    btn = {"en": "Reset password", "ne": "पासवर्ड रिसेट गर्नुहोस्"}[lang]
    inner = _paras(body) + _button(btn, reset_link)
    subject = {"en": "Password reset — Yugantar", "ne": "पासवर्ड रिसेट — युगान्तर"}[lang]
    first = email_to[0].name if email_to else ""
    try:
        await _send(email_to, subject, _shell(first, inner, None, org, lang))
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")


async def send_generic_email(
    email_to: List[NameEmail],
    subject: str,
    title: str,
    message: str,
    first_name: str,
    lang: str = "en",
    signer: Optional[Signer] = None,
) -> None:
    """A notification email, signed by `signer` (or Administration when None)."""
    lang = _lang(lang)
    org = _org()
    inner = _paras(message) + (
        f'<p style="font-size:14px; color:#555; margin:16px 0 0;">{html.escape(_PORTAL[lang])}</p>'
    )
    try:
        await _send(email_to, subject, _shell(first_name, inner, signer, org, lang))
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

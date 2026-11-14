"""
Jitsi as a Service (8x8 JaaS): tokens for joining an online meeting.

Each participant gets a short-lived RS256 JWT signed with the private key
from the JaaS dashboard (settings.JAAS_PRIVATE_KEY_PATH, git-ignored). The
token names the one room it is valid for, the person's display name, and
whether they are a moderator (office bearers and the organiser). Premium
features (recording, live streaming, phone dial-out, transcription) are off.
"""

import time
from functools import lru_cache
from pathlib import Path
from typing import Optional

import jwt

from app.core.config import settings


class MeetingsUnavailable(Exception):
    """JaaS isn't configured (no app ID or private key)."""


@lru_cache(maxsize=1)
def _private_key(path: str) -> str:
    return Path(path).read_text()


def enabled() -> bool:
    if not (settings.JAAS_APP_ID and settings.JAAS_API_KEY_ID):
        return False
    try:
        _private_key(settings.JAAS_PRIVATE_KEY_PATH)
    except OSError:
        return False
    return True


def full_room(room_name: str) -> str:
    """The room as the Jitsi iframe API expects it: '<app id>/<room>'."""
    return f"{settings.JAAS_APP_ID}/{room_name}"


def meeting_token(
    *,
    room_name: str,
    user_id: str,
    name: str,
    email: Optional[str],
    moderator: bool,
    expires_at: int,
) -> str:
    """A JaaS JWT for one person and one room, valid until `expires_at` (unix)."""
    if not enabled():
        raise MeetingsUnavailable()
    now = int(time.time())
    payload = {
        "aud": "jitsi",
        "iss": "chat",
        "sub": settings.JAAS_APP_ID,
        "room": room_name,
        "iat": now,
        "nbf": now - 10,
        "exp": max(expires_at, now + 300),
        "context": {
            "user": {
                "id": user_id,
                "name": name,
                "email": email or "",
                "avatar": "",
                "moderator": moderator,
                "hidden-from-recorder": False,
            },
            "features": {
                "livestreaming": False,
                "recording": False,
                "transcription": False,
                "outbound-call": False,
                "sip-outbound-call": False,
                "file-upload": False,
                "list-visitors": False,
                "flip": False,
            },
        },
    }
    headers = {"kid": settings.JAAS_API_KEY_ID, "typ": "JWT", "alg": "RS256"}
    return jwt.encode(payload, _private_key(settings.JAAS_PRIVATE_KEY_PATH), algorithm="RS256", headers=headers)

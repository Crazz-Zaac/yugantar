"""TOTP multi-factor authentication helpers.

The TOTP shared secret is encrypted at rest with a key derived from
SECRET_KEY (Fernet), so a database-only compromise does not reveal the second
factor. Recovery codes are stored bcrypt-hashed, like passwords, and each can
be used only once.
"""

import base64
import hashlib
import secrets
from typing import Optional

import bcrypt
import pyotp
from cryptography.fernet import Fernet

from app.core.config import settings

ISSUER = "Yugantar"
RECOVERY_CODE_COUNT = 10
# Accept the current 30s step plus one before/after, to tolerate clock drift.
TOTP_VALID_WINDOW = 1


def _fernet() -> Fernet:
    """Fernet instance keyed by a SHA-256 digest of SECRET_KEY."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


# ---------------------------------------------------------------------------
# TOTP secret
# ---------------------------------------------------------------------------
def generate_secret() -> str:
    """A fresh base32 TOTP secret (plaintext; encrypt before storing)."""
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def provisioning_uri(email: str, secret: str) -> str:
    """The otpauth:// URI the client renders as a QR code."""
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """True if `code` is a valid TOTP for `secret` (plaintext secret)."""
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit():
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=TOTP_VALID_WINDOW)


def verify_encrypted_totp(encrypted_secret: Optional[str], code: str) -> bool:
    """Decrypt a stored secret and verify a code against it."""
    if not encrypted_secret:
        return False
    try:
        return verify_totp(decrypt_secret(encrypted_secret), code)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Recovery codes
# ---------------------------------------------------------------------------
def generate_recovery_codes(
    count: int = RECOVERY_CODE_COUNT,
) -> tuple[list[str], list[dict]]:
    """Return (plaintext codes shown to the user once, hashed records to store)."""
    plaintext: list[str] = []
    records: list[dict] = []
    for _ in range(count):
        raw = secrets.token_hex(5)  # 10 lowercase hex chars
        formatted = f"{raw[:5]}-{raw[5:]}"
        plaintext.append(formatted)
        hashed = bcrypt.hashpw(formatted.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        records.append({"hash": hashed, "used": False})
    return plaintext, records


def consume_recovery_code(records: Optional[list], code: str) -> Optional[list]:
    """If `code` matches an unused recovery code, return the records with that
    code marked used (caller persists them). Otherwise return None."""
    if not records:
        return None
    candidate = (code or "").strip().lower()
    if not candidate:
        return None
    for rec in records:
        if rec.get("used"):
            continue
        try:
            if bcrypt.checkpw(candidate.encode("utf-8"), rec["hash"].encode("utf-8")):
                rec["used"] = True
                return records
        except (ValueError, KeyError, TypeError):
            continue
    return None


def recovery_codes_remaining(records: Optional[list]) -> int:
    if not records:
        return 0
    return sum(1 for rec in records if not rec.get("used"))

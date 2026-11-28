"""Request/response schemas for multi-factor authentication (TOTP)."""

from datetime import datetime
from typing import List, Optional

from sqlmodel import SQLModel


class LoginResponse(SQLModel):
    """Returned by /users/yeta-bata-signin.

    When MFA is pending, `access_token` is empty and `mfa_token` carries the
    short-lived pending token used on the /auth/mfa/* endpoints. Exactly one of
    `mfa_required` / `mfa_setup_required` is true in that case.
    """

    access_token: str = ""
    token_type: str = "bearer"
    mfa_required: bool = False       # user has MFA; must enter a code
    mfa_setup_required: bool = False  # user must enrol before first use
    mfa_token: str = ""


class MfaCodeRequest(SQLModel):
    """A 6-digit TOTP code, or (on challenge) a recovery code."""

    code: str


class MfaSetupResponse(SQLModel):
    """The new secret to enrol. `otpauth_uri` is rendered as a QR code; the
    `secret` is shown for manual entry."""

    secret: str
    otpauth_uri: str


class MfaSessionResponse(SQLModel):
    """Issued once the second factor succeeds (login completed)."""

    access_token: str
    token_type: str = "bearer"
    # Present only right after enrolment: the one-time recovery codes.
    recovery_codes: Optional[List[str]] = None


class MfaStatusResponse(SQLModel):
    # Whether the MFA feature is turned on in this environment (toggle)
    feature_enabled: bool = True
    enabled: bool
    enrolled_at: Optional[datetime] = None
    recovery_codes_remaining: int = 0


class RecoveryCodesResponse(SQLModel):
    recovery_codes: List[str]


class MfaResetRequest(SQLModel):
    """Disable/reset the current device: requires password + a current code."""

    password: str
    code: str

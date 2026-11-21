"""Multi-factor authentication (TOTP) endpoints.

Login is two steps when MFA is involved:
  1. POST /auth/login       -> password check, returns a short-lived mfa_token
  2. POST /auth/mfa/...      -> second factor, returns the real access token

MFA is required for every user, so a user who has not enrolled yet is routed
through /auth/mfa/setup + /auth/mfa/setup/confirm on first sign-in.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session

from app.api.dependencies.auth import get_current_user, get_mfa_pending_user
from app.core import mfa, rate_limit
from app.core.config import settings
from app.core.db import get_session
from app.core.refresh_tokens import (
    issue_refresh_token,
    revoke_all_refresh_tokens,
    set_refresh_cookie,
)
from app.core.security import create_access_token, verify_password
from app.models.user_model import User
from app.schemas.mfa_schema import (
    MfaCodeRequest,
    MfaResetRequest,
    MfaSessionResponse,
    MfaSetupResponse,
    MfaStatusResponse,
    RecoveryCodesResponse,
)

router = APIRouter(prefix="/auth/mfa", tags=["auth", "mfa"])


async def _issue_session(response: Response, user: User) -> str:
    """Start a full session: set the refresh cookie and return an access token."""
    set_refresh_cookie(response, issue_refresh_token(user.id))
    return await create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


# ---------------------------------------------------------------------------
# Enrolment (first sign-in, using the pending token)
# ---------------------------------------------------------------------------
@router.post("/setup", response_model=MfaSetupResponse)
def setup_mfa(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Begin enrolment for the signed-in user (from Settings): return the TOTP
    secret plus the otpauth URI to show as a QR code. Not active until confirmed.

    The pending secret is REUSED across calls: if setup is requested again
    before confirmation (e.g. React StrictMode double-invokes the effect, or
    the user reopens the page), the same secret is returned, so the QR the user
    scanned always matches what gets stored. A regenerate would otherwise leave
    the authenticator on an old secret and every code would be rejected."""
    if not settings.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Two-factor authentication is turned off in this environment.",
        )
    if user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already set up.",
        )
    secret = None
    if user.mfa_secret:
        try:
            secret = mfa.decrypt_secret(user.mfa_secret)
        except Exception:
            secret = None  # unreadable (e.g. key rotation): start fresh
    if not secret:
        secret = mfa.generate_secret()
        user.mfa_secret = mfa.encrypt_secret(secret)
        session.add(user)
        session.commit()
    return MfaSetupResponse(
        secret=secret,
        otpauth_uri=mfa.provisioning_uri(user.email, secret),
    )


@router.post("/setup/confirm", response_model=RecoveryCodesResponse)
def confirm_mfa(
    body: MfaCodeRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Confirm enrolment with the first code from the authenticator. Turns 2FA
    on for the signed-in user and returns the one-time recovery codes. The
    current session stays valid; the OTP is required from the next sign-in on."""
    if user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already set up.",
        )
    if not user.mfa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start setup first.",
        )
    rate_limit.check_mfa_allowed(str(user.id))
    if not mfa.verify_encrypted_totp(user.mfa_secret, body.code):
        rate_limit.record_mfa_failure(str(user.id))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is not correct. Check your authenticator app and try again.",
        )

    plaintext, records = mfa.generate_recovery_codes()
    user.mfa_enabled = True
    user.mfa_enrolled_at = datetime.now(timezone.utc)
    user.mfa_recovery_codes = records
    session.add(user)
    session.commit()
    rate_limit.record_mfa_success(str(user.id))
    return RecoveryCodesResponse(recovery_codes=plaintext)


# ---------------------------------------------------------------------------
# Challenge (returning user, using the pending token)
# ---------------------------------------------------------------------------
@router.post("/challenge", response_model=MfaSessionResponse)
async def challenge_mfa(
    body: MfaCodeRequest,
    response: Response,
    user: User = Depends(get_mfa_pending_user),
    session: Session = Depends(get_session),
):
    """Complete sign-in with a TOTP code or a one-time recovery code."""
    if not user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not set up for this account.",
        )
    rate_limit.check_mfa_allowed(str(user.id))

    if mfa.verify_encrypted_totp(user.mfa_secret, body.code):
        rate_limit.record_mfa_success(str(user.id))
    else:
        updated = mfa.consume_recovery_code(user.mfa_recovery_codes, body.code)
        if updated is None:
            rate_limit.record_mfa_failure(str(user.id))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="That code is not correct. Enter a code from your authenticator "
                "app, or one of your recovery codes.",
            )
        user.mfa_recovery_codes = updated
        session.add(user)
        session.commit()
        rate_limit.record_mfa_success(str(user.id))

    access_token = await _issue_session(response, user)
    return MfaSessionResponse(access_token=access_token)


# ---------------------------------------------------------------------------
# Management (signed-in user, using the real access token)
# ---------------------------------------------------------------------------
@router.get("/status", response_model=MfaStatusResponse)
def mfa_status(user: User = Depends(get_current_user)):
    return MfaStatusResponse(
        feature_enabled=settings.mfa_enabled,
        enabled=user.mfa_enabled,
        enrolled_at=user.mfa_enrolled_at,
        recovery_codes_remaining=mfa.recovery_codes_remaining(user.mfa_recovery_codes),
    )


@router.post("/recovery/regenerate", response_model=RecoveryCodesResponse)
def regenerate_recovery_codes(
    body: MfaCodeRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Replace the recovery codes (invalidating the old set). Requires a current
    authenticator code."""
    if not user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not set up.",
        )
    rate_limit.check_mfa_allowed(str(user.id))
    if not mfa.verify_encrypted_totp(user.mfa_secret, body.code):
        rate_limit.record_mfa_failure(str(user.id))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is not correct.",
        )
    rate_limit.record_mfa_success(str(user.id))
    plaintext, records = mfa.generate_recovery_codes()
    user.mfa_recovery_codes = records
    session.add(user)
    session.commit()
    return RecoveryCodesResponse(recovery_codes=plaintext)


@router.post("/reset", status_code=status.HTTP_200_OK)
def reset_mfa(
    body: MfaResetRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Turn off the current authenticator (e.g. lost device). Requires the
    account password and either a current authenticator code OR one of the
    recovery codes (so a lost device can still be removed). The user is signed
    out everywhere and can enrol again from Settings."""
    rate_limit.check_mfa_allowed(str(user.id))
    password_ok = verify_password(body.password, user.hashed_password)
    # A recovery code works here too — otherwise a lost device could never be
    # removed. (Enrolment is cleared below regardless, so consuming one is fine.)
    code_ok = mfa.verify_encrypted_totp(user.mfa_secret, body.code) or (
        mfa.consume_recovery_code(user.mfa_recovery_codes, body.code) is not None
    )
    if not (password_ok and code_ok):
        rate_limit.record_mfa_failure(str(user.id))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password or code is not correct.",
        )
    rate_limit.record_mfa_success(str(user.id))
    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_recovery_codes = None
    user.mfa_enrolled_at = None
    session.add(user)
    session.commit()
    # Invalidate every session; 2FA is now off and can be re-enabled in Settings.
    revoke_all_refresh_tokens(user.id)
    return {"msg": "Two-factor authentication has been turned off. You can set it up again from Settings."}

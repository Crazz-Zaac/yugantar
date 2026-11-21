"""Unit tests for the TOTP MFA core logic (no database required)."""

import os

# Ensure a signing key exists even when backend/.env is absent (e.g. in CI),
# since importing app.core.config validates SECRET_KEY on load.
os.environ.setdefault("SECRET_KEY", "0" * 64)

import pyotp  # noqa: E402

from app.core import mfa  # noqa: E402


def test_secret_encrypt_decrypt_roundtrip():
    secret = mfa.generate_secret()
    encrypted = mfa.encrypt_secret(secret)
    assert encrypted != secret
    assert mfa.decrypt_secret(encrypted) == secret


def test_verify_totp_accepts_current_code_and_rejects_garbage():
    secret = mfa.generate_secret()
    code = pyotp.TOTP(secret).now()
    assert mfa.verify_totp(secret, code) is True
    assert mfa.verify_totp(secret, "abcdef") is False
    assert mfa.verify_totp(secret, "") is False


def test_verify_encrypted_totp():
    secret = mfa.generate_secret()
    encrypted = mfa.encrypt_secret(secret)
    code = pyotp.TOTP(secret).now()
    assert mfa.verify_encrypted_totp(encrypted, code) is True
    assert mfa.verify_encrypted_totp(None, code) is False


def test_provisioning_uri_contains_issuer_and_account():
    secret = mfa.generate_secret()
    uri = mfa.provisioning_uri("member@example.com", secret)
    assert uri.startswith("otpauth://totp/")
    assert "Yugantar" in uri
    assert "member%40example.com" in uri or "member@example.com" in uri


def test_recovery_codes_generate_hash_and_single_use():
    plaintext, records = mfa.generate_recovery_codes()
    assert len(plaintext) == mfa.RECOVERY_CODE_COUNT
    assert len(records) == mfa.RECOVERY_CODE_COUNT
    # Stored codes are hashed, never plaintext.
    assert all(rec["hash"] != plaintext[i] for i, rec in enumerate(records))
    assert mfa.recovery_codes_remaining(records) == mfa.RECOVERY_CODE_COUNT

    # A valid code is consumed exactly once.
    updated = mfa.consume_recovery_code(records, plaintext[0])
    assert updated is not None
    assert mfa.recovery_codes_remaining(updated) == mfa.RECOVERY_CODE_COUNT - 1
    # Reusing the same code fails.
    assert mfa.consume_recovery_code(updated, plaintext[0]) is None
    # An unknown code fails.
    assert mfa.consume_recovery_code(updated, "zzzzz-zzzzz") is None


def test_consume_recovery_code_handles_empty():
    assert mfa.consume_recovery_code(None, "x") is None
    assert mfa.consume_recovery_code([], "x") is None
    plaintext, records = mfa.generate_recovery_codes()
    assert mfa.consume_recovery_code(records, "") is None

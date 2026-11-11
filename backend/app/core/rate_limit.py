"""
Fixed-window rate limits stored in Redis (keys: ratelimit:{name}).

Client IPs come from request.client.host. Behind nginx, uvicorn must run with
--proxy-headers and --forwarded-allow-ips=<nginx address> (see entrypoint.sh)
or every request would appear to come from the proxy.
"""

from typing import Optional

from fastapi import HTTPException, Request, status

from app.core.redis_client import redis_client

# (max attempts, window in seconds)
LOGIN_FAILURES_PER_ACCOUNT = (5, 15 * 60)  # per email + IP
LOGIN_FAILURES_PER_IP = (30, 15 * 60)
REGISTRATIONS_PER_IP = (5, 60 * 60)
EMAIL_REQUESTS_PER_IP = (10, 60 * 60)  # password reset / resend verification
EMAIL_REQUESTS_PER_ADDRESS = (3, 60 * 60)  # emails we send to one address


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _key(name: str) -> str:
    return f"ratelimit:{name}"


def count(name: str) -> int:
    value = redis_client.get(_key(name))
    return int(value) if value else 0


def retry_after(name: str) -> int:
    ttl = redis_client.ttl(_key(name))
    return ttl if ttl and ttl > 0 else 60


def hit(name: str, limit: tuple[int, int]) -> bool:
    """Record one attempt. Returns False if this attempt is over the limit."""
    max_attempts, window = limit
    pipe = redis_client.pipeline()
    pipe.incr(_key(name))
    pipe.expire(_key(name), window, nx=True)
    attempts, _ = pipe.execute()
    return attempts <= max_attempts


def clear(name: str) -> None:
    redis_client.delete(_key(name))


def too_many(name: str, message: Optional[str] = None) -> HTTPException:
    minutes = max(1, round(retry_after(name) / 60))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=message or f"Too many attempts. Please try again in about {minutes} minute(s).",
        headers={"Retry-After": str(retry_after(name))},
    )


def enforce(name: str, limit: tuple[int, int], message: Optional[str] = None) -> None:
    """Count this attempt and reject it with 429 if over the limit."""
    if not hit(name, limit):
        raise too_many(name, message)


# --- login: only failures count, success resets the per-account counter ---

def _login_keys(request: Request, email: str) -> tuple[str, str]:
    ip = client_ip(request)
    return f"login:{ip}:{email.strip().lower()}", f"login-ip:{ip}"


def check_login_allowed(request: Request, email: str) -> None:
    account_key, ip_key = _login_keys(request, email)
    if count(account_key) >= LOGIN_FAILURES_PER_ACCOUNT[0]:
        raise too_many(account_key, "Too many failed sign-in attempts. Please wait 15 minutes or reset your password.")
    if count(ip_key) >= LOGIN_FAILURES_PER_IP[0]:
        raise too_many(ip_key)


def record_login_failure(request: Request, email: str) -> None:
    account_key, ip_key = _login_keys(request, email)
    hit(account_key, LOGIN_FAILURES_PER_ACCOUNT)
    hit(ip_key, LOGIN_FAILURES_PER_IP)


def record_login_success(request: Request, email: str) -> None:
    clear(_login_keys(request, email)[0])

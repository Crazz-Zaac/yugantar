from fastapi import FastAPI
from app.core.config import settings
from app.api.v1.endpoints import auth
from app.api.v1.endpoints import (
    user_route,
    admin,
    deposit_policy,
    loan_policy,
    deposit,
    loan,
    loan_payment,
    ocr,
    notification,
    receipt,
    policy_signing,
    dashboard,
    calendar,
    report,
    expense,
    minutes,
    organization,
    policy_change,
)
from fastapi.middleware.cors import CORSMiddleware

# Interactive API docs only outside production (they map every endpoint)
_docs_enabled = settings.ENVIRONMENT != "production"
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Allowed browser origins come from settings (FRONTEND_HOST + BACKEND_CORS_ORIGINS),
# so production uses the real frontend origin instead of a hardcoded localhost list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.all_cors_origins,
    allow_credentials=True,
    # Only the methods and headers the frontend actually sends; credentialed
    # requests should not use wildcards.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Language"],
)

# API error messages in the reader's language (X-Language header; app/i18n.py)
from fastapi import Request  # noqa: E402
from fastapi.exception_handlers import http_exception_handler  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402
from app import i18n  # noqa: E402


@app.exception_handler(StarletteHTTPException)
async def translated_http_exception_handler(request: Request, exc: StarletteHTTPException):
    lang = i18n.request_lang(request)
    if lang != "en" and isinstance(exc.detail, str):
        exc = StarletteHTTPException(exc.status_code, i18n.translate_text(exc.detail, lang), exc.headers)
    return await http_exception_handler(request, exc)


app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(user_route.router, prefix="/api/v1")
app.include_router(deposit_policy.router, prefix="/api/v1")
app.include_router(loan_policy.router, prefix="/api/v1")
app.include_router(deposit.router, prefix="/api/v1")
app.include_router(loan.router, prefix="/api/v1")
app.include_router(loan_payment.router, prefix="/api/v1")
app.include_router(ocr.router, prefix="/api/v1")
app.include_router(notification.router, prefix="/api/v1")
app.include_router(receipt.router, prefix="/api/v1")
app.include_router(policy_signing.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(report.router, prefix="/api/v1")
app.include_router(expense.router, prefix="/api/v1")
app.include_router(minutes.router, prefix="/api/v1")
app.include_router(organization.router, prefix="/api/v1")
app.include_router(policy_change.router, prefix="/api/v1")

# app.dependency_overrides[get_session] = get_session

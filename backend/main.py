from fastapi import FastAPI
from app.api.v1.endpoints import user_route, admin
from app.core.config import settings
from app.api.v1.endpoints import auth

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(user_route.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")

# app.dependency_overrides[get_session] = get_session

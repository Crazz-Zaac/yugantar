from fastapi import FastAPI
from backend.app.api.v1.endpoints import user_route
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")
app.include_router(user_route.router, prefix="/api/v1")

# app.dependency_overrides[get_session] = get_session


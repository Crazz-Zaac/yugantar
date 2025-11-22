from fastapi import FastAPI
from app.core.config import settings
from app.api.v1.endpoints import auth
from app.api.v1.endpoints import user_route, admin, deposit_policy
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(user_route.router, prefix="/api/v1")
app.include_router(deposit_policy.router, prefix="/api/v1")

# app.dependency_overrides[get_session] = get_session

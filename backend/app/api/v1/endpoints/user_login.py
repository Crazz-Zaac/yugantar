from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from app.services.user_service import UserService
from app.core.security import create_access_token
from app.schemas.user_schema import UserLogin


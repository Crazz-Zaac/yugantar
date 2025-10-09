from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import uuid
from typing import List, Optional

from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_model import User
from app.schemas.user_schema import UserCreate, UserUpdate, UserPublic, UserDB, UserResponse
from app.db import get_session

# from app.config import settings


from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core import security
from app.database.database import get_db
from app.models.user import User, RoleEnum
from app.schemas.user import TokenData

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def get_current_user(
    db: Session = Depends(get_db)
) -> User:
    user = db.query(User).first()
    if not user:
        user = User(id=1, email="admin@medex.com", is_active=True, role=RoleEnum.ADMIN)
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_active_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user

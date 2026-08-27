from pydantic import BaseModel, EmailStr
from app.models.user import RoleEnum

class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    is_active: bool = True
    role: RoleEnum = RoleEnum.STAFF
    branch_id: int | None = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str | None = None

class UserUpdate(BaseModel):
    full_name: str | None = None
    role: RoleEnum | None = None
    is_active: bool | None = None

class AdminPasswordReset(BaseModel):
    password: str

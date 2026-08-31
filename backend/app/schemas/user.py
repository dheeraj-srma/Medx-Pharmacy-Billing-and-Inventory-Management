from pydantic import BaseModel, EmailStr
from app.models.user import RoleEnum

class BranchInfo(BaseModel):
    id: int
    code: str
    name: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool = True

    class Config:
        from_attributes = True

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
    branch: BranchInfo | None = None

    class Config:
        from_attributes = True

class UserMeResponse(BaseModel):
    user: UserResponse
    branch: BranchInfo | None = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str | None = None

class UserUpdate(BaseModel):
    full_name: str | None = None
    role: RoleEnum | None = None
    is_active: bool | None = None
    branch_id: int | None = None

class AdminPasswordReset(BaseModel):
    password: str

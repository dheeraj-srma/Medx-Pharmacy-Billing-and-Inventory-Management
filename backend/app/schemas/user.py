from pydantic import BaseModel, EmailStr, field_validator
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

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if isinstance(v, str):
            v_lower = v.lower().strip()
            for r in RoleEnum:
                if r.value == v_lower or r.name.lower() == v_lower:
                    return r
        return v

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

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if v is not None and isinstance(v, str):
            v_lower = v.lower().strip()
            for r in RoleEnum:
                if r.value == v_lower or r.name.lower() == v_lower:
                    return r
        return v

class AdminPasswordReset(BaseModel):
    password: str

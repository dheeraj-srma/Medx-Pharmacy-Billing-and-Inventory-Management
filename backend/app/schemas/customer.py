from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    doctor_name: Optional[str] = None

class CustomerCreate(CustomerBase):
    class Config:
        from_attributes = True

class CustomerUpdate(CustomerBase):
    class Config:
        from_attributes = True

class Customer(CustomerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

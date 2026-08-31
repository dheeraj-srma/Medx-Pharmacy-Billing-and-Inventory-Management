from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    doctor_name: Optional[str] = None

class CustomerCreate(CustomerBase):
    whatsapp_opt_in: bool = False

class CustomerUpdate(CustomerBase):
    whatsapp_opt_in: Optional[bool] = None

class Customer(CustomerBase):
    id: int
    phone_raw: Optional[str] = None
    phone_normalized: Optional[str] = None
    whatsapp_opt_in: bool = False
    whatsapp_opt_in_at: Optional[datetime] = None
    branch_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

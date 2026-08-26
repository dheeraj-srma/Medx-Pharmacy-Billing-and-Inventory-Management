from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SupplierBase(BaseModel):
    name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True

class SupplierCreate(SupplierBase):
    class Config:
        from_attributes = True

class SupplierUpdate(SupplierBase):
    class Config:
        from_attributes = True

class Supplier(SupplierBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

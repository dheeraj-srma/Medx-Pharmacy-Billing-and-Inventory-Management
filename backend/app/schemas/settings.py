from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class StoreSettingsBase(BaseModel):
    store_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    default_tax_rate: float = 12.0
    print_gstin: bool = True

class StoreSettingsUpdate(StoreSettingsBase):
    class Config:
        from_attributes = True

class StoreSettingsResponse(StoreSettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True

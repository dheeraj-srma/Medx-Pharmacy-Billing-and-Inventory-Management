from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime
from app.schemas.supplier import Supplier
from app.schemas.product import ProductResponse

class PurchaseItemBase(BaseModel):
    product_id: int
    batch_number: str
    manufacturing_date: Optional[date] = None
    expiry_date: date
    quantity: float = Field(..., gt=0)
    purchase_price: float = Field(..., ge=0)
    mrp: float = Field(..., ge=0)
    selling_price: float = Field(..., ge=0)

class PurchaseItemCreate(PurchaseItemBase):
    class Config:
        from_attributes = True

class PurchaseItem(PurchaseItemBase):
    id: int
    purchase_id: int
    product: Optional[ProductResponse] = None

    class Config:
        from_attributes = True

class PurchaseBase(BaseModel):
    supplier_id: int
    invoice_number: Optional[str] = None
    purchase_date: date
    total_amount: float = Field(default=0.0, ge=0)
    tax_amount: float = Field(default=0.0, ge=0)
    discount_amount: float = Field(default=0.0, ge=0)
    grand_total: float = Field(default=0.0, ge=0)
    notes: Optional[str] = None
    branch: Optional[str] = "Branch 1"

class PurchaseCreate(PurchaseBase):
    items: List[PurchaseItemCreate]

class Purchase(PurchaseBase):
    id: int
    created_by: int
    created_at: datetime
    items: List[PurchaseItem] = []
    supplier: Optional[Supplier] = None

    class Config:
        from_attributes = True

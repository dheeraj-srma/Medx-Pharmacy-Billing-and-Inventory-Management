from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from decimal import Decimal
from datetime import date, datetime
from app.schemas.supplier import Supplier
from app.schemas.product import ProductResponse

DECIMAL_CONFIG = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

class PurchaseItemBase(BaseModel):
    product_id: int
    batch_number: str
    manufacturing_date: Optional[date] = None
    expiry_date: date
    quantity: int = Field(..., gt=0) # Smallest sellable units
    purchase_price: Decimal = Field(..., ge=0)
    mrp: Decimal = Field(..., ge=0)
    selling_price: Decimal = Field(..., ge=0)
    model_config = DECIMAL_CONFIG

class PurchaseItemCreate(PurchaseItemBase):
    pass

class PurchaseItem(PurchaseItemBase):
    id: int
    purchase_id: int
    product: Optional[ProductResponse] = None
    model_config = DECIMAL_CONFIG

class PurchaseBase(BaseModel):
    supplier_id: int
    invoice_number: Optional[str] = None
    purchase_date: date
    total_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    tax_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    discount_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    grand_total: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    notes: Optional[str] = None
    model_config = DECIMAL_CONFIG

class PurchaseCreate(PurchaseBase):
    items: List[PurchaseItemCreate]

class Purchase(PurchaseBase):
    id: int
    branch_id: int
    created_by: int
    created_at: datetime
    items: List[PurchaseItem] = []
    supplier: Optional[Supplier] = None
    model_config = DECIMAL_CONFIG

from pydantic import BaseModel
from typing import List, Optional

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True

class CategoryCreate(CategoryBase):
    class Config:
        from_attributes = True

class CategoryResponse(CategoryBase):
    id: int

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    name: str
    generic_name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    pack_size: Optional[str] = None
    image_url: Optional[str] = None
    mrp: float
    selling_price: float
    reorder_level: int = 10
    barcode: Optional[str] = None
    sku: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_percentage: float = 0.0
    prescription_required: bool = False
    is_active: bool = True
    is_archived: bool = False
    category_id: Optional[int] = None

from datetime import date

class ProductCreate(ProductBase):
    initial_stock: Optional[int] = None
    manufacturing_date: Optional[date] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None

class ProductResponse(ProductBase):
    id: int
    category: Optional[CategoryResponse] = None

    class Config:
        from_attributes = True

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    pack_size: Optional[str] = None
    image_url: Optional[str] = None
    mrp: Optional[float] = None
    selling_price: Optional[float] = None
    reorder_level: Optional[int] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_percentage: Optional[float] = None
    prescription_required: Optional[bool] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None
    category_id: Optional[int] = None

    class Config:
        from_attributes = True

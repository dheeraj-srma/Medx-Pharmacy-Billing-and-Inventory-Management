from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ReturnItemCreate(BaseModel):
    sale_item_id: int
    quantity: Decimal = Field(..., gt=0)
    restock_inventory: bool = True

class ReturnCreate(BaseModel):
    sale_id: int
    reason: Optional[str] = None
    items: List[ReturnItemCreate]

class ReturnItemResponse(BaseModel):
    id: int
    return_id: int
    sale_item_id: int
    product_id: int
    batch_id: int
    quantity: Decimal
    refund_amount: Decimal
    restock_inventory: bool
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class ReturnResponse(BaseModel):
    id: int
    sale_id: int
    branch_id: int
    return_number: str
    return_date: datetime
    total_refund: Decimal
    reason: Optional[str] = None
    created_by: int
    created_at: datetime
    items: List[ReturnItemResponse] = []
    model_config = ConfigDict(from_attributes=True)

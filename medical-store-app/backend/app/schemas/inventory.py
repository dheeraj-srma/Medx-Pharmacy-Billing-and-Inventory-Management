from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import Optional
from app.models.inventory import TransactionTypeEnum

class InventoryBatchBase(BaseModel):
    product_id: int
    batch_number: Optional[str] = None
    manufacturing_date: Optional[date] = None
    expiry_date: date
    quantity_available: int
    purchase_price: float = 0.0
    mrp: float = 0.0
    selling_price: float = 0.0
    supplier_id: Optional[int] = None

class InventoryBatchCreate(InventoryBatchBase):
    class Config:
        from_attributes = True

class InventoryBatchResponse(InventoryBatchBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class InventoryTransactionBase(BaseModel):
    product_id: int
    batch_id: int
    quantity_change: int
    transaction_type: TransactionTypeEnum
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None

class InventoryTransactionCreate(InventoryTransactionBase):
    class Config:
        from_attributes = True

class InventoryTransactionResponse(InventoryTransactionBase):
    id: int
    user_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class StockAdjustmentRequest(BaseModel):
    batch_id: int
    quantity_change: int
    transaction_type: TransactionTypeEnum = TransactionTypeEnum.ADJUSTMENT
    notes: Optional[str] = None

class InventoryBatchListResponse(InventoryBatchResponse):
    product_name: str
    product_sku: Optional[str] = None

class InventoryTransactionListResponse(InventoryTransactionResponse):
    product_name: str
    batch_number: Optional[str] = None
    user_name: Optional[str] = None

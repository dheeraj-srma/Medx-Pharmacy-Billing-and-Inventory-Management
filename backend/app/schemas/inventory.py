from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime, timezone
from typing import Optional
from app.models.inventory import TransactionTypeEnum

DECIMAL_CONFIG = ConfigDict(
    from_attributes=True,
    json_encoders={
        Decimal: float,
        datetime: lambda dt: (dt.replace(tzinfo=timezone.utc).isoformat() if dt.tzinfo is None else dt.isoformat()),
    }
)

class InventoryBatchBase(BaseModel):
    product_id: int
    batch_number: Optional[str] = None
    manufacturing_date: Optional[date] = None
    expiry_date: date
    quantity_available: Decimal = Decimal("0.0000")
    purchase_price: Decimal = Decimal("0.00")
    mrp: Decimal = Decimal("0.00")
    selling_price: Decimal = Decimal("0.00")
    supplier_id: Optional[int] = None
    branch_id: Optional[int] = None

class InventoryBatchCreate(InventoryBatchBase):
    model_config = ConfigDict(from_attributes=True)

class InventoryBatchResponse(InventoryBatchBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = DECIMAL_CONFIG

class InventoryTransactionBase(BaseModel):
    product_id: int
    batch_id: int
    quantity_change: Decimal
    transaction_type: TransactionTypeEnum
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    branch_id: Optional[int] = None

class InventoryTransactionCreate(InventoryTransactionBase):
    model_config = DECIMAL_CONFIG

class InventoryTransactionResponse(InventoryTransactionBase):
    id: int
    user_id: int
    timestamp: datetime
    model_config = DECIMAL_CONFIG

class StockAdjustmentRequest(BaseModel):
    batch_id: int
    quantity_change: Decimal
    transaction_type: TransactionTypeEnum = TransactionTypeEnum.ADJUSTMENT
    notes: Optional[str] = None

class InventoryBatchListResponse(InventoryBatchResponse):
    product_name: str
    product_sku: Optional[str] = None

class InventoryTransactionListResponse(InventoryTransactionResponse):
    product_name: str
    batch_number: Optional[str] = None
    user_name: Optional[str] = None

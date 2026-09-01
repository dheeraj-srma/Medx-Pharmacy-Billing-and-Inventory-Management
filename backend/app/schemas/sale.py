from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from app.schemas.customer import Customer
from app.models.payment import PaymentMethodEnum, PaymentStatusEnum

DECIMAL_CONFIG = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

class PaymentCreate(BaseModel):
    method: PaymentMethodEnum = PaymentMethodEnum.CASH
    amount: Optional[Decimal] = None
    reference_number: Optional[str] = None
    model_config = DECIMAL_CONFIG

class PaymentResponse(BaseModel):
    id: int
    sale_id: int
    branch_id: int
    method: PaymentMethodEnum
    amount: Decimal
    status: PaymentStatusEnum
    reference_number: Optional[str] = None
    created_at: datetime
    model_config = DECIMAL_CONFIG

class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(..., gt=0) # Supports fractional quantities for loose tablet dispensing
    batch_id: Optional[int] = None   # If omitted, backend allocates via FEFO
    unit_price: Optional[Decimal] = None # Calculated authoritatively by backend
    discount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    total_price: Optional[Decimal] = None
    model_config = DECIMAL_CONFIG

class SaleItemResponse(BaseModel):
    id: int
    sale_id: int
    product_id: int
    batch_id: int
    quantity: Decimal
    unit_price: Decimal
    discount: Decimal
    total_price: Decimal
    batch_number: Optional[str] = None
    product_name: Optional[str] = None
    model_config = DECIMAL_CONFIG

class SaleCreate(BaseModel):
    customer_id: Optional[int] = None
    items: List[SaleItemCreate]
    discount_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    discount_percent: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0, le=100)
    payment_method: Optional[str] = "Cash"
    payments: Optional[List[PaymentCreate]] = None
    # Client may send preview totals; backend will recompute authoritatively
    total_amount: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    round_off: Optional[Decimal] = None
    grand_total: Optional[Decimal] = None
    branch_id: Optional[int] = None # Ignored for ordinary staff; server-derived
    model_config = DECIMAL_CONFIG

class SalePreviewResponse(BaseModel):
    total_amount: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    round_off: Decimal = Decimal("0.00")
    grand_total: Decimal
    items: List[SaleItemResponse]
    model_config = DECIMAL_CONFIG

class Sale(BaseModel):
    id: int
    invoice_number: str
    branch_id: int
    customer_id: Optional[int] = None
    total_amount: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    round_off: Decimal = Decimal("0.00")
    grand_total: Decimal
    payment_method: str
    status: str
    created_by: int
    created_at: datetime
    sale_date: datetime
    customer: Optional[Customer] = None
    items: List[SaleItemResponse] = []
    payments: List[PaymentResponse] = []
    model_config = DECIMAL_CONFIG

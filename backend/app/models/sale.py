from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict, Any
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, index=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    sale_date = Column(DateTime, default=lambda: datetime.now(IST), index=True)
    
    total_amount = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    tax_amount = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    round_off = Column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    grand_total = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    
    payment_method = Column(String, default="Cash") # Legacy summary column
    status = Column(String, default="COMPLETED", nullable=False) # COMPLETED, REFUNDED
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(IST), index=True)

    __table_args__ = (
        Index("ix_sales_branch_created", "branch_id", "created_at"),
        Index("ix_sales_branch_invoice", "branch_id", "invoice_number", unique=True),
    )

    customer = relationship("Customer")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="sale", cascade="all, delete-orphan")
    user = relationship("User")
    branch = relationship("Branch", back_populates="sales")

    @property
    def taxable_amount(self) -> Decimal:
        if self.items:
            return sum((item.taxable_amount for item in self.items), Decimal("0.00"))
        tot = Decimal(str(self.total_amount or "0.00"))
        tax = Decimal(str(self.tax_amount or "0.00"))
        return max(Decimal("0.00"), tot - tax)

    @property
    def total_mrp(self) -> Decimal:
        if self.items:
            return sum((item.mrp * Decimal(str(item.quantity or "1")) for item in self.items), Decimal("0.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return Decimal(str(self.total_amount or "0.00"))

    @property
    def total_mrp_discount(self) -> Decimal:
        if self.items:
            return sum((item.mrp_discount_amount for item in self.items), Decimal("0.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return Decimal(str(self.discount_amount or "0.00"))

    @property
    def overall_mrp_discount_percent(self) -> Decimal:
        if self.total_mrp > Decimal("0.00") and self.total_mrp_discount > Decimal("0.00"):
            return ((self.total_mrp_discount / self.total_mrp) * Decimal("100.0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return Decimal("0.00")

    @property
    def tax_breakdown(self) -> dict:
        breakdown = {}
        for item in self.items:
            rate = item.gst_percentage
            rate_key = f"{rate:.1f}%" if rate % 1 != 0 else f"{int(rate)}%"
            if rate_key not in breakdown:
                breakdown[rate_key] = {
                    "rate": float(rate),
                    "taxable_amount": Decimal("0.00"),
                    "gst_amount": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                }
            breakdown[rate_key]["taxable_amount"] += item.taxable_amount
            breakdown[rate_key]["gst_amount"] += item.gst_amount
            breakdown[rate_key]["cgst_amount"] += item.cgst_amount
            breakdown[rate_key]["sgst_amount"] += item.sgst_amount
        return breakdown

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inventory_batches.id"), nullable=False)
    
    quantity = Column(Numeric(12, 4), nullable=False) # Supports fractional quantities for loose tablets
    unit_price = Column(Numeric(12, 2), nullable=False) # Authoritative selling price
    discount = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_price = Column(Numeric(12, 2), nullable=False)

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")
    batch = relationship("InventoryBatch")

    @property
    def product_name(self) -> str:
        return self.product.name if self.product else ""

    @property
    def batch_number(self) -> str:
        return self.batch.batch_number if self.batch else ""

    @property
    def mrp(self) -> Decimal:
        if self.batch and self.batch.mrp is not None and self.batch.mrp > Decimal("0.00"):
            return Decimal(str(self.batch.mrp))
        if self.product and self.product.mrp is not None:
            return Decimal(str(self.product.mrp))
        return Decimal(str(self.unit_price or "0.00"))

    @property
    def hsn_code(self) -> Optional[str]:
        return self.product.hsn_code if self.product else None

    @property
    def gst_percentage(self) -> Decimal:
        if self.product and self.product.gst_percentage is not None:
            return Decimal(str(self.product.gst_percentage))
        return Decimal("0.00")

    @property
    def taxable_amount(self) -> Decimal:
        rate = self.gst_percentage
        tot = Decimal(str(self.total_price or "0.00"))
        if rate > Decimal("0.00"):
            divisor = Decimal("1.0") + (rate / Decimal("100.0"))
            return (tot / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return tot

    @property
    def gst_amount(self) -> Decimal:
        tot = Decimal(str(self.total_price or "0.00"))
        return (tot - self.taxable_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def cgst_amount(self) -> Decimal:
        return (self.gst_amount / Decimal("2.0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def sgst_amount(self) -> Decimal:
        return (self.gst_amount - self.cgst_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def mrp_discount_amount(self) -> Decimal:
        mrp_tot = (self.mrp * Decimal(str(self.quantity or "1"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        tot = Decimal(str(self.total_price or "0.00"))
        if mrp_tot > tot:
            return (mrp_tot - tot).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return Decimal("0.00")

    @property
    def mrp_discount_percent(self) -> Decimal:
        mrp_tot = (self.mrp * Decimal(str(self.quantity or "1"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if mrp_tot > Decimal("0.00") and self.mrp_discount_amount > Decimal("0.00"):
            return ((self.mrp_discount_amount / mrp_tot) * Decimal("100.0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return Decimal("0.00")

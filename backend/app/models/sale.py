from decimal import Decimal
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

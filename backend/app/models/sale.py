from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database.database import Base

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, index=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    sale_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    total_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    
    payment_method = Column(String, default="Cash") # Cash, Card, UPI
    status = Column(String, default="COMPLETED") # COMPLETED, REFUNDED
    branch = Column(String, default="C-Scheme")
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer")
    items = relationship("SaleItem", back_populates="sale")
    user = relationship("User")

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inventory_batches.id"), nullable=False)
    
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False) # Selling price from batch
    discount = Column(Float, default=0.0)
    total_price = Column(Float, nullable=False)

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")
    batch = relationship("InventoryBatch")

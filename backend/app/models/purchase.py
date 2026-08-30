from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime, timezone
from app.database.database import Base
from app.models.supplier import Supplier
from app.models.user import User
from app.models.product import Product

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    invoice_number = Column(String, index=True, nullable=True)
    purchase_date = Column(Date, nullable=False)
    
    total_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    
    notes = Column(Text, nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(IST))

    supplier = relationship("Supplier")
    items = relationship("PurchaseItem", back_populates="purchase")
    user = relationship("User")
    branch = relationship("Branch", back_populates="purchases")

class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    
    batch_number = Column(String, index=True, nullable=False)
    manufacturing_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=False)
    
    quantity = Column(Float, nullable=False)
    purchase_price = Column(Float, nullable=False)
    mrp = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)

    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product")

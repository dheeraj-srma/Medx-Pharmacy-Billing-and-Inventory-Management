from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Date
from sqlalchemy.orm import relationship
import enum
from datetime import datetime, timezone
from app.database.database import Base

class TransactionTypeEnum(str, enum.Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    RETURN = "RETURN"
    ADJUSTMENT = "ADJUSTMENT"
    DAMAGE = "DAMAGE"
    EXPIRED = "EXPIRED"
    INITIAL_STOCK = "INITIAL_STOCK"

class InventoryBatch(Base):
    __tablename__ = "inventory_batches"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_number = Column(String, index=True, nullable=True) # Optional for initial stock if unknown
    manufacturing_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=False)
    quantity_available = Column(Float, default=0.0, nullable=False)
    purchase_price = Column(Float, default=0.0)
    mrp = Column(Float, default=0.0)
    selling_price = Column(Float, default=0.0)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    branch = Column(String, default="Branch 1", nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    product = relationship("Product")

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inventory_batches.id"), nullable=False)
    quantity_change = Column(Float, nullable=False)
    transaction_type = Column(Enum(TransactionTypeEnum), nullable=False)
    reference_type = Column(String, nullable=True) # e.g. "Invoice", "PurchaseOrder", "InitialStock"
    reference_id = Column(String, nullable=True) # e.g. Purchase ID, Sale ID
    notes = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    branch = Column(String, default="Branch 1", nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    product = relationship("Product")
    batch = relationship("InventoryBatch")
    user = relationship("User")

from decimal import Decimal
from sqlalchemy import Column, Integer, String, Boolean, Numeric, ForeignKey, DateTime, Enum, Date, Index
from sqlalchemy.orm import relationship
import enum
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class TransactionTypeEnum(str, enum.Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    RETURN = "RETURN"
    ADJUSTMENT = "ADJUSTMENT"
    DAMAGE = "DAMAGE"
    EXPIRED = "EXPIRED"
    INITIAL_STOCK = "INITIAL_STOCK"
    TRANSFER = "TRANSFER"

class InventoryBatch(Base):
    __tablename__ = "inventory_batches"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    batch_number = Column(String, index=True, nullable=True)
    manufacturing_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=False, index=True)
    quantity_available = Column(Numeric(12, 4), default=Decimal("0.0000"), nullable=False) # Supports fractional quantities
    purchase_price = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    mrp = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    selling_price = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    
    # Placeholders & Metadata flags
    is_placeholder_expiry = Column(Boolean, default=False, nullable=False)
    is_placeholder_batch = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=lambda: datetime.now(IST))
    updated_at = Column(DateTime, default=lambda: datetime.now(IST), onupdate=lambda: datetime.now(IST))

    __table_args__ = (
        Index("ix_batches_branch_expiry", "branch_id", "expiry_date"),
        Index("ix_batches_branch_product", "branch_id", "product_id"),
    )

    product = relationship("Product")
    branch = relationship("Branch", back_populates="batches")

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("inventory_batches.id"), nullable=False, index=True)
    quantity_change = Column(Numeric(12, 4), nullable=False) # Supports fractional changes
    transaction_type = Column(Enum(TransactionTypeEnum), nullable=False)
    reference_type = Column(String, nullable=True) # e.g. "Sale", "Purchase", "Adjustment"
    reference_id = Column(String, nullable=True) # e.g. Purchase ID, Sale ID
    notes = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(IST), index=True)

    __table_args__ = (
        Index("ix_transactions_branch_timestamp", "branch_id", "timestamp"),
    )

    product = relationship("Product")
    batch = relationship("InventoryBatch")
    user = relationship("User")
    branch = relationship("Branch", back_populates="transactions")

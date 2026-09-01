from decimal import Decimal
from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class Return(Base):
    __tablename__ = "returns"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    return_number = Column(String, index=True, nullable=False)
    return_date = Column(DateTime, default=lambda: datetime.now(IST), index=True)
    
    total_refund = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    reason = Column(String, nullable=True)
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(IST), index=True)

    __table_args__ = (
        Index("ix_returns_branch_created", "branch_id", "created_at"),
        Index("ix_returns_branch_number", "branch_id", "return_number", unique=True),
    )

    sale = relationship("Sale")
    items = relationship("ReturnItem", back_populates="return_order", cascade="all, delete-orphan")
    user = relationship("User")
    branch = relationship("Branch")

class ReturnItem(Base):
    __tablename__ = "return_items"

    id = Column(Integer, primary_key=True, index=True)
    return_id = Column(Integer, ForeignKey("returns.id"), nullable=False, index=True)
    sale_item_id = Column(Integer, ForeignKey("sale_items.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inventory_batches.id"), nullable=False)
    
    quantity = Column(Numeric(12, 4), nullable=False)
    refund_amount = Column(Numeric(12, 2), nullable=False)
    restock_inventory = Column(Boolean, default=True, nullable=False)

    return_order = relationship("Return", back_populates="items")
    product = relationship("Product")
    batch = relationship("InventoryBatch")
    sale_item = relationship("SaleItem")

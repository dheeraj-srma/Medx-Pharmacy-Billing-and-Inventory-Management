from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime, timezone
from app.database.database import Base

class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(IST))

    users = relationship("User", back_populates="branch")
    customers = relationship("Customer", back_populates="branch")
    batches = relationship("InventoryBatch", back_populates="branch")
    transactions = relationship("InventoryTransaction", back_populates="branch")
    sales = relationship("Sale", back_populates="branch")
    purchases = relationship("Purchase", back_populates="branch")
    settings = relationship("StoreSettings", back_populates="branch")

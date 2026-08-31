from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    phone = Column(String, nullable=True) # Legacy/display format
    phone_raw = Column(String, nullable=True) # As entered by user
    phone_normalized = Column(String, index=True, nullable=True) # Normalized 10-digit number for search/deduplication
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    doctor_name = Column(String, nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    
    # Future-ready WhatsApp delivery preparation
    whatsapp_opt_in = Column(Boolean, default=False, nullable=False)
    whatsapp_opt_in_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(IST))

    __table_args__ = (
        UniqueConstraint("branch_id", "phone_normalized", name="uq_customer_branch_phone"),
    )

    branch = relationship("Branch", back_populates="customers")

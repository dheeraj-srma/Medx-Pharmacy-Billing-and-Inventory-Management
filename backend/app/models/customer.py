from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime, timezone
from app.database.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    phone = Column(String, index=True, nullable=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    doctor_name = Column(String, nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(IST))

    branch = relationship("Branch", back_populates="customers")

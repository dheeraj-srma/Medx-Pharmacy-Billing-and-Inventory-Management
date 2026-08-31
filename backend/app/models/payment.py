import enum
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class PaymentMethodEnum(str, enum.Enum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"
    BANK_TRANSFER = "BANK_TRANSFER"
    OTHER = "OTHER"

class PaymentStatusEnum(str, enum.Enum):
    COMPLETED = "COMPLETED"
    PENDING = "PENDING"
    REFUNDED = "REFUNDED"
    FAILED = "FAILED"

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    method = Column(Enum(PaymentMethodEnum), default=PaymentMethodEnum.CASH, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(Enum(PaymentStatusEnum), default=PaymentStatusEnum.COMPLETED, nullable=False)
    reference_number = Column(String, nullable=True) # Transaction ref, UPI ref, etc.
    created_at = Column(DateTime, default=lambda: datetime.now(IST))

    sale = relationship("Sale", back_populates="payments")
    branch = relationship("Branch")

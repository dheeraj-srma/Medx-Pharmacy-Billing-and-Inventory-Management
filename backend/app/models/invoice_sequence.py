from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class InvoiceSequence(Base):
    __tablename__ = "invoice_sequences"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    financial_year = Column(String(10), nullable=False, index=True)  # e.g. "2026-27"
    last_number = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(IST), onupdate=lambda: datetime.now(IST))

    __table_args__ = (
        UniqueConstraint("branch_id", "financial_year", name="uq_invoice_sequence_branch_fy"),
    )

    branch = relationship("Branch")

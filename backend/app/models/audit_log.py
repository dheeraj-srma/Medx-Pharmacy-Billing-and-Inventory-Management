from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.timezone import IST
from datetime import datetime
from app.database.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)  # e.g. "SALE_CREATED", "STOCK_ADJUSTED"
    entity_type = Column(String, nullable=True, index=True)  # e.g. "sale", "product", "inventory_batch"
    entity_id = Column(String, nullable=True, index=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(IST), index=True)

    __table_args__ = (
        Index("ix_audit_branch_timestamp", "branch_id", "timestamp"),
        Index("ix_audit_action_timestamp", "action", "timestamp"),
    )

    user = relationship("User")
    branch = relationship("Branch")

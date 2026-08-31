"""
Data Integrity Issues model.

Tracks missing fields, invalid values, fallback placeholders, and resolution audit trail.
"""
import enum
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.database.database import Base
from app.core.timezone import IST
from datetime import datetime


class IssueTypeEnum(str, enum.Enum):
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    INVALID_FORMAT = "INVALID_FORMAT"
    INVALID_VALUE = "INVALID_VALUE"
    BUSINESS_RULE_WARNING = "BUSINESS_RULE_WARNING"
    NORMALIZED_VALUE = "NORMALIZED_VALUE"


class SeverityEnum(str, enum.Enum):
    VALID = "VALID"
    NORMALIZED = "NORMALIZED"
    MISSING = "MISSING"
    WARNING = "WARNING"
    ERROR = "ERROR"


class DataIntegrityIssue(Base):
    __tablename__ = "data_integrity_issues"

    id = Column(Integer, primary_key=True, index=True)

    # What entity this issue belongs to
    entity_type = Column(String, nullable=False, index=True)   # e.g. "product", "inventory_batch"
    entity_id = Column(Integer, nullable=False, index=True)    # The record's PK
    field_name = Column(String, nullable=False)                # e.g. "batch_number"

    # Issue classification
    issue_type = Column(Enum(IssueTypeEnum), nullable=False)
    severity = Column(Enum(SeverityEnum), nullable=False)

    # The synthetic placeholder stored in the DB (if any)
    placeholder_value = Column(String, nullable=True)

    # The raw value the user originally submitted (may be empty string or None)
    original_value = Column(Text, nullable=True)

    # Human-readable explanation
    message = Column(Text, nullable=False)

    # Branch isolation — issues inherit the branch of their parent entity
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True, index=True)

    # Lifecycle
    created_at = Column(DateTime, default=lambda: datetime.now(IST), nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # user id

    # Free-form JSON stored as text for extra context
    metadata_json = Column(Text, nullable=True)

    branch = relationship("Branch")
    resolver = relationship("User", foreign_keys=[resolved_by])

    @property
    def is_resolved(self) -> bool:
        return self.resolved_at is not None

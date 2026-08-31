from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.data_integrity import IssueTypeEnum, SeverityEnum


class DataIntegrityIssueResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    field_name: str
    issue_type: IssueTypeEnum
    severity: SeverityEnum
    message: str
    original_value: Optional[str] = None
    placeholder_value: Optional[str] = None
    branch_id: Optional[int] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = None
    is_resolved: bool = False

    class Config:
        from_attributes = True


class DataIntegrityIssueResolveRequest(BaseModel):
    issue_id: int


class DataIntegritySummary(BaseModel):
    unresolved_total: int
    missing: int
    warnings: int
    errors: int
    resolved_total: int


class DataIntegrityIssuesList(BaseModel):
    total: int
    issues: List[DataIntegrityIssueResponse]


# Embedded in entity responses
class FieldIssueInfo(BaseModel):
    """Lightweight issue descriptor returned inside entity API responses."""
    field: str
    severity: str
    message: str


class EntityDataIntegrity(BaseModel):
    """Embedded in entity responses (e.g. ProductResponse)."""
    is_incomplete: bool
    issues: List[FieldIssueInfo]

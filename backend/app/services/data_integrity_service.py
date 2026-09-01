"""
Data Integrity Service

CRUD operations for DataIntegrityIssue records and entity-level completeness checks.
All write operations MUST be called within the same DB transaction as the entity they describe.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models.data_integrity import DataIntegrityIssue, IssueTypeEnum, SeverityEnum
from app.services.validation_service import FieldIssue, Severity, IssueType
from app.core.timezone import IST


def _map_severity(s: Severity) -> SeverityEnum:
    return SeverityEnum(s.value)


def _map_issue_type(t: IssueType) -> IssueTypeEnum:
    return IssueTypeEnum(t.value)


def create_issue_from_field_issue(
    db: Session,
    entity_type: str,
    entity_id: int,
    field_issue: FieldIssue,
    branch_id: Optional[int] = None,
) -> DataIntegrityIssue:
    """
    Persist a FieldIssue as a DataIntegrityIssue record.
    Prevents duplicate active (unresolved) issues for the same (entity_type, entity_id, field_name, issue_type).
    Must be called within an open transaction — caller commits.
    """
    mapped_type = _map_issue_type(field_issue.issue_type)

    # Check for existing active issue
    existing = db.query(DataIntegrityIssue).filter(
        DataIntegrityIssue.entity_type == entity_type,
        DataIntegrityIssue.entity_id == entity_id,
        DataIntegrityIssue.field_name == field_issue.field_name,
        DataIntegrityIssue.issue_type == mapped_type,
        DataIntegrityIssue.resolved_at == None,
    ).first()

    if existing:
        existing.placeholder_value = field_issue.placeholder_value
        existing.message = field_issue.message
        if field_issue.original_value is not None:
            existing.original_value = str(field_issue.original_value)
        return existing

    issue = DataIntegrityIssue(
        entity_type=entity_type,
        entity_id=entity_id,
        field_name=field_issue.field_name,
        issue_type=mapped_type,
        severity=_map_severity(field_issue.severity),
        placeholder_value=field_issue.placeholder_value,
        original_value=str(field_issue.original_value) if field_issue.original_value is not None else None,
        message=field_issue.message,
        branch_id=branch_id,
    )
    db.add(issue)
    return issue


def create_issues_from_validation(
    db: Session,
    entity_type: str,
    entity_id: int,
    field_issues: list,
    branch_id: Optional[int] = None,
    only_severities: Optional[list] = None,
) -> list:
    """
    Persist a list of FieldIssue objects. Optionally filter by severity.
    Returns the list of created DataIntegrityIssue records.
    """
    created = []
    for fi in field_issues:
        if only_severities and fi.severity not in only_severities:
            continue
        record = create_issue_from_field_issue(db, entity_type, entity_id, fi, branch_id)
        created.append(record)
    return created


def get_issues_for_entity(
    db: Session,
    entity_type: str,
    entity_id: int,
    unresolved_only: bool = True,
) -> list:
    """Get all DataIntegrityIssue records for a specific entity."""
    query = db.query(DataIntegrityIssue).filter(
        DataIntegrityIssue.entity_type == entity_type,
        DataIntegrityIssue.entity_id == entity_id,
    )
    if unresolved_only:
        query = query.filter(DataIntegrityIssue.resolved_at == None)  # noqa: E711
    return query.all()


def is_entity_complete(db: Session, entity_type: str, entity_id: int) -> bool:
    """Return True if the entity has no unresolved issues."""
    count = db.query(DataIntegrityIssue).filter(
        DataIntegrityIssue.entity_type == entity_type,
        DataIntegrityIssue.entity_id == entity_id,
        DataIntegrityIssue.resolved_at == None,  # noqa: E711
    ).count()
    return count == 0


def resolve_issue(
    db: Session,
    issue_id: int,
    resolved_by_user_id: int,
    corrected_value: Optional[str] = None,
    notes: Optional[str] = None,
) -> Optional[DataIntegrityIssue]:
    """Mark a single issue as resolved with optional correction metadata."""
    issue = db.query(DataIntegrityIssue).filter(DataIntegrityIssue.id == issue_id).first()
    if not issue:
        return None
    issue.resolved_at = datetime.now(IST)
    issue.resolved_by = resolved_by_user_id
    if corrected_value or notes:
        import json
        meta = {}
        if issue.metadata_json:
            try:
                meta = json.loads(issue.metadata_json)
            except Exception:
                meta = {"raw": issue.metadata_json}
        if corrected_value:
            meta["corrected_value"] = corrected_value
        if notes:
            meta["resolution_notes"] = notes
        issue.metadata_json = json.dumps(meta)

    db.add(issue)
    return issue


def auto_resolve_field(
    db: Session,
    entity_type: str,
    entity_id: int,
    field_name: str,
    resolved_by_user_id: int,
) -> int:
    """
    Auto-resolve all unresolved issues for a specific field on an entity.
    Used when a user corrects a missing/invalid value.
    Returns the number of issues resolved.
    """
    issues = db.query(DataIntegrityIssue).filter(
        DataIntegrityIssue.entity_type == entity_type,
        DataIntegrityIssue.entity_id == entity_id,
        DataIntegrityIssue.field_name == field_name,
        DataIntegrityIssue.resolved_at == None,  # noqa: E711
    ).all()
    now = datetime.now(IST)
    for issue in issues:
        issue.resolved_at = now
        issue.resolved_by = resolved_by_user_id
        db.add(issue)
    return len(issues)


def get_issues_list(
    db: Session,
    branch_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple:
    """
    List issues with filtering. Returns (issues, total_count).
    branch_id=None returns all branches (for superadmin).
    """
    query = db.query(DataIntegrityIssue)

    if branch_id is not None:
        query = query.filter(DataIntegrityIssue.branch_id == branch_id)
    if entity_type:
        query = query.filter(DataIntegrityIssue.entity_type == entity_type)
    if severity:
        query = query.filter(DataIntegrityIssue.severity == severity)
    if resolved is True:
        query = query.filter(DataIntegrityIssue.resolved_at != None)  # noqa: E711
    elif resolved is False:
        query = query.filter(DataIntegrityIssue.resolved_at == None)  # noqa: E711

    total = query.count()
    issues = query.order_by(DataIntegrityIssue.created_at.desc()).offset(skip).limit(limit).all()
    return issues, total


def get_summary(db: Session, branch_id: Optional[int] = None) -> dict:
    """Return summary counts for the data integrity dashboard."""
    base = db.query(DataIntegrityIssue)
    if branch_id is not None:
        base = base.filter(DataIntegrityIssue.branch_id == branch_id)

    unresolved = base.filter(DataIntegrityIssue.resolved_at == None).count()  # noqa: E711
    missing = base.filter(
        DataIntegrityIssue.resolved_at == None,
        DataIntegrityIssue.severity == SeverityEnum.MISSING,
    ).count()
    warnings = base.filter(
        DataIntegrityIssue.resolved_at == None,
        DataIntegrityIssue.severity == SeverityEnum.WARNING,
    ).count()
    errors = base.filter(
        DataIntegrityIssue.resolved_at == None,
        DataIntegrityIssue.severity == SeverityEnum.ERROR,
    ).count()
    resolved_total = base.filter(DataIntegrityIssue.resolved_at != None).count()  # noqa: E711

    return {
        "unresolved_total": unresolved,
        "missing": missing,
        "warnings": warnings,
        "errors": errors,
        "resolved_total": resolved_total,
    }

"""
Data Integrity API

Exposes:
  GET  /data-integrity/issues        — list/filter issues
  GET  /data-integrity/issues/{id}   — single issue detail
  POST /data-integrity/issues/{id}/resolve — resolve an issue
  GET  /data-integrity/summary       — dashboard summary counts
"""
from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import RoleEnum
from app.models.data_integrity import DataIntegrityIssue
from app.schemas.data_integrity import (
    DataIntegrityIssueResponse,
    DataIntegritySummary,
    DataIntegrityIssuesList,
)
from app.services import data_integrity_service

router = APIRouter()


def _serialize_issue(issue: DataIntegrityIssue) -> dict:
    return {
        "id": issue.id,
        "entity_type": issue.entity_type,
        "entity_id": issue.entity_id,
        "field_name": issue.field_name,
        "issue_type": issue.issue_type,
        "severity": issue.severity,
        "message": issue.message,
        "original_value": issue.original_value,
        "placeholder_value": issue.placeholder_value,
        "branch_id": issue.branch_id,
        "created_at": issue.created_at,
        "resolved_at": issue.resolved_at,
        "resolved_by": issue.resolved_by,
        "is_resolved": issue.is_resolved,
    }


@router.get("/issues")
def list_issues(
    entity_type: Optional[str] = None,
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user=Depends(deps.get_current_active_user),
) -> Any:
    """
    List data integrity issues.
    - Superadmin sees all branches.
    - Branch users see only their branch.
    - Filterable by entity_type, severity, resolved status.
    """
    branch_id = None if current_user.role == RoleEnum.SUPERADMIN else current_user.branch_id

    issues, total = data_integrity_service.get_issues_list(
        db=db,
        branch_id=branch_id,
        entity_type=entity_type,
        severity=severity,
        resolved=resolved,
        skip=skip,
        limit=limit,
    )

    return {
        "total": total,
        "issues": [_serialize_issue(i) for i in issues],
    }


@router.get("/issues/{issue_id}")
def get_issue(
    issue_id: int,
    db: Session = Depends(deps.get_db),
    current_user=Depends(deps.get_current_active_user),
) -> Any:
    issue = db.query(DataIntegrityIssue).filter(DataIntegrityIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Branch isolation
    if current_user.role != RoleEnum.SUPERADMIN:
        if issue.branch_id and issue.branch_id != current_user.branch_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return _serialize_issue(issue)


@router.post("/issues/{issue_id}/resolve")
def resolve_issue(
    issue_id: int,
    db: Session = Depends(deps.get_db),
    current_user=Depends(deps.get_current_active_user),
) -> Any:
    """Mark a data integrity issue as resolved."""
    issue = db.query(DataIntegrityIssue).filter(DataIntegrityIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    if current_user.role != RoleEnum.SUPERADMIN:
        if issue.branch_id and issue.branch_id != current_user.branch_id:
            raise HTTPException(status_code=403, detail="Access denied")

    if issue.is_resolved:
        raise HTTPException(status_code=400, detail="Issue is already resolved")

    resolved = data_integrity_service.resolve_issue(db, issue_id, current_user.id)
    db.commit()
    return _serialize_issue(resolved)


@router.get("/summary")
def get_summary(
    db: Session = Depends(deps.get_db),
    current_user=Depends(deps.get_current_active_user),
) -> Any:
    """Return summary counts for the data integrity dashboard."""
    branch_id = None if current_user.role == RoleEnum.SUPERADMIN else current_user.branch_id
    return data_integrity_service.get_summary(db, branch_id)

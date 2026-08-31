from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.api import deps
from app.models.branch import Branch
from app.schemas.user import BranchInfo

router = APIRouter()

@router.get("/", response_model=List[BranchInfo])
def get_branches(
    db: Session = Depends(get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Get list of pharmacy branches. Dynamic source of truth for branch selection.
    """
    branches = db.query(Branch).filter(Branch.is_active == True).order_by(Branch.id.asc()).all()
    return branches

@router.get("/{branch_id}", response_model=BranchInfo)
def get_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Get details of a specific branch.
    """
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from app.api import deps
from app.models.returns import Return, ReturnItem
from app.models.user import RoleEnum
from app.schemas.returns import ReturnResponse, ReturnCreate
from app.services.returns_service import ReturnsService

router = APIRouter()

@router.get("/", response_model=List[ReturnResponse])
def get_returns(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    query = db.query(Return).options(
        selectinload(Return.items),
    )
    if authorized_branch is not None:
        query = query.filter(Return.branch_id == authorized_branch)

    return query.order_by(Return.created_at.desc()).all()

@router.post("/", response_model=ReturnResponse)
def create_return(
    return_in: ReturnCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Authoritative Sale Return endpoint.
    Validates returned quantities against original sale, computes refund,
    restocks unexpired batches, creates inventory ledger entries, and updates sale status.
    """
    if current_user.role == RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin accounts have read-only access and cannot process returns."
        )
    return ReturnsService.process_return(db, return_in, current_user)

@router.get("/{return_id}", response_model=ReturnResponse)
def get_return(
    return_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    ret = db.query(Return).options(
        selectinload(Return.items),
    ).filter(Return.id == return_id).first()

    if not ret:
        raise HTTPException(status_code=404, detail="Return record not found")

    if current_user.role != RoleEnum.SUPERADMIN and ret.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")

    return ret

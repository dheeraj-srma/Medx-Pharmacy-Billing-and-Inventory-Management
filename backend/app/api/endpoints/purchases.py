from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List, Optional
from app.api import deps
from app.models.purchase import Purchase, PurchaseItem
from app.models.user import RoleEnum
from app.schemas.purchase import Purchase as PurchaseSchema, PurchaseCreate
from app.services.purchase_service import PurchaseService

router = APIRouter()

@router.get("/", response_model=List[PurchaseSchema])
def get_purchases(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    query = db.query(Purchase).options(
        selectinload(Purchase.supplier),
        selectinload(Purchase.items).selectinload(PurchaseItem.product),
    )
    if authorized_branch is not None:
        query = query.filter(Purchase.branch_id == authorized_branch)
        
    purchases = query.order_by(Purchase.created_at.desc()).all()
    return purchases

@router.post("/", response_model=PurchaseSchema)
def create_purchase(
    purchase: PurchaseCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Authoritative Inward Stock (Purchase Entry) endpoint.
    Recalculates totals in Decimal, locks and updates inventory batches,
    and records immutable inventory ledger transactions.
    """
    if current_user.role == RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin accounts have read-only access and cannot create purchases."
        )
    return PurchaseService.create_purchase(db, purchase, current_user)

@router.get("/{purchase_id}", response_model=PurchaseSchema)
def get_purchase(
    purchase_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    purchase = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.items).joinedload(PurchaseItem.product),
        )
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
        
    if current_user.role != RoleEnum.SUPERADMIN and purchase.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")
        
    return purchase

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from typing import List, Optional
from datetime import date
from app.api import deps
from app.models.sale import Sale
from app.models.user import RoleEnum
from app.schemas.sale import Sale as SaleSchema, SaleCreate, SalePreviewResponse
from app.services.sales_service import SalesService

router = APIRouter()

@router.get("/", response_model=List[SaleSchema])
def get_sales(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    query = db.query(Sale).options(
        selectinload(Sale.customer),
        selectinload(Sale.items),
        selectinload(Sale.payments),
    )
    if authorized_branch is not None:
        query = query.filter(Sale.branch_id == authorized_branch)
        
    if start_date:
        query = query.filter(func.date(Sale.sale_date) >= start_date)
    if end_date:
        query = query.filter(func.date(Sale.sale_date) <= end_date)
        
    sales = query.order_by(Sale.created_at.desc()).all()
    return sales

@router.post("/preview", response_model=SalePreviewResponse)
def preview_sale(
    sale: SaleCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Preview pricing, tax calculations, and FEFO batch allocations before checkout.
    Does not mutate stock or persist records.
    """
    return SalesService.preview_sale(db, sale, current_user)

@router.post("/", response_model=SaleSchema)
def create_sale(
    sale: SaleCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Authoritative checkout endpoint.
    Performs real FEFO allocation, row locking, decimal calculation, sequential invoice generation,
    and single atomic transaction commit.
    """
    if current_user.role == RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin accounts have read-only access and cannot create operational sales."
        )
    return SalesService.create_sale(db, sale, current_user)

@router.get("/{sale_id}", response_model=SaleSchema)
def get_sale(
    sale_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    sale = db.query(Sale).options(
        selectinload(Sale.customer),
        selectinload(Sale.items),
        selectinload(Sale.payments),
    ).filter(Sale.id == sale_id).first()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
        
    if current_user.role != RoleEnum.SUPERADMIN and sale.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")
        
    return sale

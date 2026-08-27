from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timezone, date
import uuid
from app.api import deps
from app.models.sale import Sale, SaleItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.user import RoleEnum
from app.schemas.sale import Sale as SaleSchema, SaleCreate

router = APIRouter()

@router.get("/", response_model=List[SaleSchema])
def get_sales(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    query = db.query(Sale).options(
        selectinload(Sale.customer),
        selectinload(Sale.items),
    )
    if current_user.role == RoleEnum.SUPERADMIN:
        if branch_id:
            query = query.filter(Sale.branch_id == branch_id)
    else:
        query = query.filter(Sale.branch_id == current_user.branch_id)
        
    if start_date:
        query = query.filter(func.date(Sale.sale_date) >= start_date)
    if end_date:
        query = query.filter(func.date(Sale.sale_date) <= end_date)
        
    sales = query.order_by(Sale.created_at.desc()).all()
    return sales

@router.post("/", response_model=SaleSchema)
def create_sale(
    sale: SaleCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    if current_user.role == RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin has read-only access and cannot create sales."
        )
        
    try:
        invoice_number = sale.invoice_number
        if not invoice_number:
            now_str = datetime.now().strftime("%Y%m%d%H%M%S")
            short_uuid = str(uuid.uuid4())[:4].upper()
            invoice_number = f"INV-{now_str}-{short_uuid}"

        # Determine sale branch_id: default to current_user.branch_id, but allow customization if provided
        sale_branch_id = sale.branch_id if sale.branch_id else current_user.branch_id

        db_sale = Sale(
            invoice_number=invoice_number,
            customer_id=sale.customer_id,
            total_amount=sale.total_amount,
            tax_amount=sale.tax_amount,
            discount_amount=sale.discount_amount,
            grand_total=sale.grand_total,
            payment_method=sale.payment_method,
            status="COMPLETED",
            branch_id=sale_branch_id,
            created_by=current_user.id
        )
        db.add(db_sale)
        db.flush()
        
        for item in sale.items:
            batch = db.query(InventoryBatch).filter(
                InventoryBatch.id == item.batch_id,
                InventoryBatch.branch_id == sale_branch_id
            ).with_for_update().first()
            
            if not batch:
                raise ValueError(f"Batch ID {item.batch_id} not found in this branch.")
            
            if batch.product_id != item.product_id:
                raise ValueError(f"Product ID mismatch for batch {item.batch_id}.")
                
            if batch.quantity_available < item.quantity:
                raise ValueError(f"Insufficient stock for batch {item.batch_id}. Available: {batch.quantity_available}, Requested: {item.quantity}")

            batch.quantity_available -= item.quantity
            
            db_item = SaleItem(
                sale_id=db_sale.id,
                product_id=item.product_id,
                batch_id=item.batch_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount=item.discount,
                total_price=item.total_price
            )
            db.add(db_item)
            
            transaction = InventoryTransaction(
                product_id=item.product_id,
                batch_id=batch.id,
                quantity_change=-item.quantity,
                transaction_type=TransactionTypeEnum.SALE,
                reference_type="Sale",
                reference_id=str(db_sale.id),
                notes=f"Sale Invoice: {invoice_number}",
                user_id=current_user.id,
                branch_id=sale_branch_id,
                timestamp=datetime.now(timezone.utc)
            )
            db.add(transaction)
            
        db.commit()
        db.refresh(db_sale)
        return db_sale
        
    except ValueError as ve:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process sale: {str(e)}")

@router.get("/{sale_id}", response_model=SaleSchema)
def get_sale(
    sale_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    sale = db.query(Sale).options(
        selectinload(Sale.customer),
        selectinload(Sale.items),
    ).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
        
    if current_user.role != RoleEnum.SUPERADMIN and sale.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")
        
    return sale

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import uuid
from app.api import deps
from app.models.sale import Sale, SaleItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.schemas.sale import Sale as SaleSchema, SaleCreate

router = APIRouter()

@router.get("/", response_model=List[SaleSchema])
def get_sales(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    sales = db.query(Sale).order_by(Sale.created_at.desc()).all()
    return sales

@router.post("/", response_model=SaleSchema)
def create_sale(
    sale: SaleCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    try:
        # Generate Invoice Number if not provided
        invoice_number = sale.invoice_number
        if not invoice_number:
            # Simple unique invoice number generation
            now_str = datetime.now().strftime("%Y%m%d%H%M%S")
            short_uuid = str(uuid.uuid4())[:4].upper()
            invoice_number = f"INV-{now_str}-{short_uuid}"

        # Create Sale
        db_sale = Sale(
            invoice_number=invoice_number,
            customer_id=sale.customer_id,
            total_amount=sale.total_amount,
            tax_amount=sale.tax_amount,
            discount_amount=sale.discount_amount,
            grand_total=sale.grand_total,
            payment_method=sale.payment_method,
            status="COMPLETED",
            created_by=current_user.id
        )
        db.add(db_sale)
        db.flush() # Get sale ID
        
        for item in sale.items:
            # Find the batch
            batch = db.query(InventoryBatch).filter(InventoryBatch.id == item.batch_id).with_for_update().first()
            if not batch:
                raise ValueError(f"Batch ID {item.batch_id} not found.")
            
            if batch.product_id != item.product_id:
                raise ValueError(f"Product ID mismatch for batch {item.batch_id}.")
                
            if batch.quantity_available < item.quantity:
                raise ValueError(f"Insufficient stock for batch {item.batch_id}. Available: {batch.quantity_available}, Requested: {item.quantity}")

            # Deduct quantity
            batch.quantity_available -= item.quantity
            
            # Create SaleItem
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
            
            # Create InventoryTransaction
            transaction = InventoryTransaction(
                product_id=item.product_id,
                batch_id=batch.id,
                quantity_change=-item.quantity, # Negative for sale
                transaction_type=TransactionTypeEnum.SALE,
                reference_type="Sale",
                reference_id=str(db_sale.id),
                notes=f"Sale Invoice: {invoice_number}",
                user_id=current_user.id,
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
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from app.api import deps
from app.models.purchase import Purchase, PurchaseItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.schemas.purchase import Purchase as PurchaseSchema, PurchaseCreate

router = APIRouter()

@router.get("/", response_model=List[PurchaseSchema])
def get_purchases(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    purchases = db.query(Purchase).order_by(Purchase.created_at.desc()).all()
    return purchases

@router.post("/", response_model=PurchaseSchema)
def create_purchase(
    purchase: PurchaseCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    try:
        # Create Purchase
        db_purchase = Purchase(
            supplier_id=purchase.supplier_id,
            invoice_number=purchase.invoice_number,
            purchase_date=purchase.purchase_date,
            total_amount=purchase.total_amount,
            tax_amount=purchase.tax_amount,
            discount_amount=purchase.discount_amount,
            grand_total=purchase.grand_total,
            notes=purchase.notes,
            branch=purchase.branch,
            created_by=current_user.id
        )
        db.add(db_purchase)
        db.flush() # Get purchase ID
        
        for item in purchase.items:
            # Create PurchaseItem
            db_item = PurchaseItem(
                purchase_id=db_purchase.id,
                product_id=item.product_id,
                batch_number=item.batch_number,
                manufacturing_date=item.manufacturing_date,
                expiry_date=item.expiry_date,
                quantity=item.quantity,
                purchase_price=item.purchase_price,
                mrp=item.mrp,
                selling_price=item.selling_price
            )
            db.add(db_item)
            
            # Find or Create InventoryBatch
            batch = db.query(InventoryBatch).filter(
                InventoryBatch.product_id == item.product_id,
                InventoryBatch.batch_number == item.batch_number
            ).first()
            
            if not batch:
                batch = InventoryBatch(
                    product_id=item.product_id,
                    batch_number=item.batch_number,
                    manufacturing_date=item.manufacturing_date,
                    expiry_date=item.expiry_date,
                    quantity_available=0,
                    purchase_price=item.purchase_price,
                    mrp=item.mrp,
                    selling_price=item.selling_price,
                    supplier_id=purchase.supplier_id
                )
                db.add(batch)
                db.flush()
            else:
                # Update batch pricing and supplier if it exists (usually we take latest)
                batch.purchase_price = item.purchase_price
                batch.mrp = item.mrp
                batch.selling_price = item.selling_price
                batch.supplier_id = purchase.supplier_id
            
            # Update quantity
            batch.quantity_available += item.quantity
            
            # Create InventoryTransaction
            transaction = InventoryTransaction(
                product_id=item.product_id,
                batch_id=batch.id,
                quantity_change=item.quantity,
                transaction_type=TransactionTypeEnum.PURCHASE,
                reference_type="Purchase",
                reference_id=str(db_purchase.id),
                notes=f"Invoice: {purchase.invoice_number}",
                user_id=current_user.id,
                timestamp=datetime.now(timezone.utc)
            )
            db.add(transaction)
            
        db.commit()
        db.refresh(db_purchase)
        return db_purchase
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create purchase: {str(e)}")

@router.get("/{purchase_id}", response_model=PurchaseSchema)
def get_purchase(
    purchase_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase

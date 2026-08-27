from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date, datetime, timezone, timedelta
from app.api import deps
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.schemas.inventory import InventoryBatchResponse, InventoryBatchListResponse, InventoryTransactionListResponse, StockAdjustmentRequest
from app.models.product import Product
from app.models.user import User
from pydantic import BaseModel

router = APIRouter()

class ActiveBatchResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    generic_name: Optional[str] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    pack_size: Optional[str] = None
    image_url: Optional[str] = None
    batch_number: str
    expiry_date: date
    quantity_available: float
    mrp: float
    selling_price: float
    branch: Optional[str] = None

    class Config:
        from_attributes = True

@router.get("/active-batches", response_model=List[ActiveBatchResponse])
def get_active_batches(
    branch: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    # Fetch all active batches that have quantity > 0 and are not expired
    # Join with product to get product details for POS search & billing
    today = date.today()
    query = db.query(
        InventoryBatch.id,
        InventoryBatch.product_id,
        Product.name.label("product_name"),
        Product.generic_name.label("generic_name"),
        Product.brand.label("brand"),
        Product.barcode.label("barcode"),
        Product.sku.label("sku"),
        Product.pack_size.label("pack_size"),
        Product.image_url.label("image_url"),
        InventoryBatch.batch_number,
        InventoryBatch.expiry_date,
        InventoryBatch.quantity_available,
        InventoryBatch.mrp,
        InventoryBatch.selling_price,
        InventoryBatch.branch
    ).join(Product, Product.id == InventoryBatch.product_id)\
     .filter(Product.is_active == True)\
     .filter(Product.is_archived == False)\
     .filter(InventoryBatch.quantity_available > 0)\
     .filter(InventoryBatch.expiry_date >= today)

    if branch:
        query = query.filter(InventoryBatch.branch == branch)

    results = query.order_by(Product.name.asc(), InventoryBatch.expiry_date.asc()).all()
    
    batches = []
    for row in results:
        batches.append({
            "id": row.id,
            "product_id": row.product_id,
            "product_name": row.product_name,
            "generic_name": row.generic_name,
            "brand": row.brand,
            "barcode": row.barcode,
            "sku": row.sku,
            "pack_size": row.pack_size,
            "image_url": row.image_url,
            "batch_number": row.batch_number,
            "expiry_date": row.expiry_date,
            "quantity_available": row.quantity_available,
            "mrp": row.mrp,
            "selling_price": row.selling_price,
            "branch": row.branch
        })
    return batches

@router.get("/batches", response_model=List[InventoryBatchListResponse])
def get_all_batches(
    search: Optional[str] = None,
    filter_status: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    query = db.query(
        InventoryBatch,
        Product.name.label("product_name"),
        Product.sku.label("product_sku")
    ).join(Product, Product.id == InventoryBatch.product_id)
    
    if search:
        query = query.filter(
            (Product.name.ilike(f"%{search}%")) |
            (InventoryBatch.batch_number.ilike(f"%{search}%"))
        )
        
    today = date.today()
    if filter_status == "expired":
        query = query.filter(InventoryBatch.expiry_date < today)
    elif filter_status == "expiring":
        query = query.filter(
            InventoryBatch.expiry_date >= today,
            InventoryBatch.expiry_date <= today + timedelta(days=30)
        )
    elif filter_status == "low_stock":
        query = query.filter(
            InventoryBatch.quantity_available > 0,
            InventoryBatch.quantity_available <= 10
        )
        
    results = query.order_by(InventoryBatch.expiry_date.asc()).all()
    
    batches = []
    for batch_obj, prod_name, prod_sku in results:
        batch_dict = {
            "id": batch_obj.id,
            "product_id": batch_obj.product_id,
            "batch_number": batch_obj.batch_number,
            "manufacturing_date": batch_obj.manufacturing_date,
            "expiry_date": batch_obj.expiry_date,
            "quantity_available": batch_obj.quantity_available,
            "purchase_price": batch_obj.purchase_price,
            "mrp": batch_obj.mrp,
            "selling_price": batch_obj.selling_price,
            "supplier_id": batch_obj.supplier_id,
            "created_at": batch_obj.created_at,
            "updated_at": batch_obj.updated_at,
            "product_name": prod_name,
            "product_sku": prod_sku
        }
        batches.append(batch_dict)
    return batches

@router.get("/transactions", response_model=List[InventoryTransactionListResponse])
def get_transactions(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    from app.models.user import User as UserModel
    results = db.query(
        InventoryTransaction,
        Product.name.label("product_name"),
        InventoryBatch.batch_number.label("batch_number"),
        UserModel.full_name.label("user_name")
    ).join(Product, Product.id == InventoryTransaction.product_id)\
     .join(InventoryBatch, InventoryBatch.id == InventoryTransaction.batch_id)\
     .join(UserModel, UserModel.id == InventoryTransaction.user_id)\
     .order_by(InventoryTransaction.timestamp.desc())\
     .all()
     
    txns = []
    for txn_obj, prod_name, batch_num, user_name in results:
        txn_dict = {
            "id": txn_obj.id,
            "product_id": txn_obj.product_id,
            "batch_id": txn_obj.batch_id,
            "quantity_change": txn_obj.quantity_change,
            "transaction_type": txn_obj.transaction_type,
            "reference_type": txn_obj.reference_type,
            "reference_id": txn_obj.reference_id,
            "notes": txn_obj.notes,
            "user_id": txn_obj.user_id,
            "timestamp": txn_obj.timestamp,
            "product_name": prod_name,
            "batch_number": batch_num,
            "user_name": user_name
        }
        txns.append(txn_dict)
    return txns

@router.post("/adjust", response_model=InventoryBatchResponse)
def adjust_stock(
    adjust_in: StockAdjustmentRequest,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    batch = db.query(InventoryBatch).filter(InventoryBatch.id == adjust_in.batch_id).with_for_update().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    if adjust_in.quantity_change < 0 and batch.quantity_available < abs(adjust_in.quantity_change):
        raise HTTPException(status_code=400, detail="Cannot adjust below available quantity")
        
    batch.quantity_available += adjust_in.quantity_change
    
    txn = InventoryTransaction(
        product_id=batch.product_id,
        batch_id=batch.id,
        quantity_change=adjust_in.quantity_change,
        transaction_type=adjust_in.transaction_type,
        reference_type="Adjustment",
        reference_id=str(current_user.id),
        notes=adjust_in.notes or "Manual adjustment",
        user_id=current_user.id,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(batch)
    db.add(txn)
    db.commit()
    db.refresh(batch)
    return batch

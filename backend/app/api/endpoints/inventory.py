from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app.core.timezone import IST
from datetime import date, datetime, timezone, timedelta
from app.api import deps
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.schemas.inventory import InventoryBatchResponse, InventoryBatchListResponse, InventoryTransactionListResponse, StockAdjustmentRequest
from app.models.product import Product
from app.models.user import User, RoleEnum
from pydantic import BaseModel, ConfigDict

router = APIRouter()

from decimal import Decimal

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
    branch_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

def ensure_default_batches(db: Session, branch_id: int):
    """
    Ensure all active, non-archived products have at least one batch for Branch 1.
    Branch 2 and other branches remain clean zero until staff explicitly inwards stock.
    """
    if branch_id != 1:
        return

    existing_product_ids = [
        row[0] for row in db.query(InventoryBatch.product_id).filter(
            InventoryBatch.branch_id == branch_id
        ).distinct().all()
    ]
    
    query = db.query(Product).filter(
        Product.is_active == True,
        Product.is_archived == False
    )
    if existing_product_ids:
        query = query.filter(~Product.id.in_(existing_product_ids))
    missing_products = query.all()
    
    if missing_products:
        far_future = date(9999, 12, 31)
        for prod in missing_products:
            def_cost = prod.cost_price if (prod.cost_price and float(prod.cost_price) > 0) else Decimal(str(round(float(prod.selling_price or prod.mrp or 0.0) * 0.70, 2)))
            batch = InventoryBatch(
                product_id=prod.id,
                batch_number=f"BATCH-INIT-{prod.id}",
                expiry_date=far_future,
                quantity_available=Decimal("0.0000"),
                purchase_price=def_cost,
                mrp=Decimal(str(prod.mrp or 0.0)),
                selling_price=Decimal(str(prod.selling_price or 0.0)),
                branch_id=branch_id,
                is_placeholder_expiry=True,
                is_placeholder_batch=True
            )
            db.add(batch)
        db.commit()

@router.get("/active-batches", response_model=List[ActiveBatchResponse])
def get_active_batches(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    today = date.today()
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    effective_branch = authorized_branch if authorized_branch is not None else (current_user.branch_id if current_user.branch_id else 1)
    if effective_branch == 1:
        ensure_default_batches(db, 1)

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
        InventoryBatch.branch_id
    ).join(Product, Product.id == InventoryBatch.product_id)\
     .filter(Product.is_active == True)\
     .filter(Product.is_archived == False)\
     .filter(InventoryBatch.quantity_available >= 0)\
     .filter(InventoryBatch.expiry_date >= today)\
     .filter(InventoryBatch.branch_id == effective_branch)

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
            "branch_id": row.branch_id
        })
    return batches

@router.get("/batches", response_model=List[InventoryBatchListResponse])
def get_all_batches(
    search: Optional[str] = None,
    filter_status: Optional[str] = None,
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    effective_branch = authorized_branch if authorized_branch is not None else (current_user.branch_id if current_user.branch_id else 1)
    if effective_branch == 1:
        ensure_default_batches(db, 1)

    query = db.query(
        InventoryBatch,
        Product.name.label("product_name"),
        Product.sku.label("product_sku")
    ).join(Product, Product.id == InventoryBatch.product_id)\
     .filter(Product.is_archived == False)\
     .filter(InventoryBatch.branch_id == effective_branch)
        
    if search:
        tokens = search.strip().split()
        for token in tokens:
            search_term = f"%{token}%"
            query = query.filter(
                (Product.name.ilike(search_term)) |
                (Product.generic_name.ilike(search_term)) |
                (Product.brand.ilike(search_term)) |
                (Product.sku.ilike(search_term)) |
                (Product.barcode.ilike(search_term)) |
                (InventoryBatch.batch_number.ilike(search_term))
            )
        
    today = date.today()
    if filter_status == "expired":
        query = query.filter(InventoryBatch.expiry_date < today)
    elif filter_status == "expiring":
        query = query.filter(
            InventoryBatch.expiry_date >= today,
            InventoryBatch.expiry_date <= today + timedelta(days=30)
        )
    elif filter_status == "healthy":
        query = query.filter(InventoryBatch.quantity_available > 10)
    elif filter_status == "critical":
        query = query.filter(
            InventoryBatch.quantity_available > 0,
            InventoryBatch.quantity_available <= 5
        )
    elif filter_status == "low_stock":
        query = query.filter(
            InventoryBatch.quantity_available > 0,
            InventoryBatch.quantity_available <= 10
        )
    elif filter_status == "out_of_stock":
        query = query.filter(InventoryBatch.quantity_available <= 0)
        
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
            "branch_id": batch_obj.branch_id,
            "product_name": prod_name,
            "product_sku": prod_sku
        }
        batches.append(batch_dict)
    return batches

@router.get("/batches/{batch_id}")
def get_batch_details(
    batch_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    from app.models.supplier import Supplier
    batch = db.query(
        InventoryBatch,
        Product.name.label("product_name"),
        Product.generic_name.label("generic_name"),
        Product.sku.label("product_sku"),
        Product.hsn_code.label("hsn_code"),
        Product.gst_percentage.label("gst_percentage"),
        Supplier.name.label("supplier_name")
    ).join(Product, Product.id == InventoryBatch.product_id)\
     .outerjoin(Supplier, Supplier.id == InventoryBatch.supplier_id)\
     .filter(InventoryBatch.id == batch_id).first()
     
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    b_obj, p_name, g_name, p_sku, hsn, gst, s_name = batch

    if current_user.role != RoleEnum.SUPERADMIN and b_obj.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")

    return {
        "id": b_obj.id,
        "product_id": b_obj.product_id,
        "product_name": p_name,
        "generic_name": g_name,
        "sku": p_sku,
        "hsn_code": hsn,
        "gst_percentage": float(gst or 0),
        "batch_number": b_obj.batch_number,
        "manufacturing_date": b_obj.manufacturing_date.isoformat() if b_obj.manufacturing_date else None,
        "expiry_date": b_obj.expiry_date.isoformat(),
        "quantity_available": float(b_obj.quantity_available),
        "purchase_price": float(b_obj.purchase_price),
        "cost_price": float(b_obj.purchase_price),
        "mrp": float(b_obj.mrp),
        "selling_price": float(b_obj.selling_price),
        "supplier_id": b_obj.supplier_id,
        "supplier_name": s_name,
        "branch_id": b_obj.branch_id,
        "created_at": b_obj.created_at.isoformat() if b_obj.created_at else None,
        "updated_at": b_obj.updated_at.isoformat() if b_obj.updated_at else None,
    }

@router.get("/transactions", response_model=List[InventoryTransactionListResponse])
def get_transactions(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    from app.models.user import User as UserModel
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    effective_branch = authorized_branch if authorized_branch is not None else (current_user.branch_id if current_user.branch_id else 1)
    query = db.query(
        InventoryTransaction,
        Product.name.label("product_name"),
        InventoryBatch.batch_number.label("batch_number"),
        UserModel.full_name.label("user_name")
    ).join(Product, Product.id == InventoryTransaction.product_id)\
     .join(InventoryBatch, InventoryBatch.id == InventoryTransaction.batch_id)\
     .join(UserModel, UserModel.id == InventoryTransaction.user_id)\
     .filter(InventoryTransaction.branch_id == effective_branch)
        
    results = query.order_by(InventoryTransaction.timestamp.desc()).all()
     
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
            "branch_id": txn_obj.branch_id,
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
    batch = db.query(InventoryBatch).filter(
        InventoryBatch.id == adjust_in.batch_id
    ).with_for_update().first()
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    if current_user.role not in (RoleEnum.SUPERADMIN, RoleEnum.ADMIN):
        if batch.branch_id != current_user.branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Batch does not belong to your branch."
            )
        
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
        branch_id=batch.branch_id,
        timestamp=datetime.now(IST)
    )
    db.add(batch)
    db.add(txn)

    # Audit Log
    from app.services.audit_service import AuditService
    AuditService.log(
        db=db,
        action="STOCK_ADJUSTED",
        user_id=current_user.id,
        branch_id=batch.branch_id,
        entity_type="inventory_batch",
        entity_id=batch.id,
        new_value={"quantity_change": str(adjust_in.quantity_change), "type": adjust_in.transaction_type.value, "notes": adjust_in.notes}
    )

    db.commit()
    db.refresh(batch)
    return batch

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date
from app.api import deps
from app.models.inventory import InventoryBatch
from app.schemas.inventory import InventoryBatchResponse
from app.models.product import Product
from pydantic import BaseModel

router = APIRouter()

class ActiveBatchResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    batch_number: str
    expiry_date: date
    quantity_available: int
    mrp: float
    selling_price: float

    class Config:
        from_attributes = True

@router.get("/active-batches", response_model=List[ActiveBatchResponse])
def get_active_batches(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    # Fetch all batches that have quantity > 0 and are not expired
    # We also join with product to get product_name which is very useful for POS
    today = date.today()
    results = db.query(
        InventoryBatch.id,
        InventoryBatch.product_id,
        Product.name.label("product_name"),
        InventoryBatch.batch_number,
        InventoryBatch.expiry_date,
        InventoryBatch.quantity_available,
        InventoryBatch.mrp,
        InventoryBatch.selling_price
    ).join(Product, Product.id == InventoryBatch.product_id)\
     .filter(InventoryBatch.quantity_available > 0)\
     .filter(InventoryBatch.expiry_date >= today)\
     .all()
    
    # Map raw tuple results to dictionary to match the schema
    # SQLAlchemy returns Row objects which can be unpacked
    batches = []
    for row in results:
        batches.append({
            "id": row.id,
            "product_id": row.product_id,
            "product_name": row.product_name,
            "batch_number": row.batch_number,
            "expiry_date": row.expiry_date,
            "quantity_available": row.quantity_available,
            "mrp": row.mrp,
            "selling_price": row.selling_price
        })
    return batches

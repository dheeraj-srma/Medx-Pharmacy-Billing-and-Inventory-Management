from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app.models.supplier import Supplier
from app.schemas.supplier import Supplier as SupplierSchema, SupplierCreate, SupplierUpdate

router = APIRouter()

@router.get("/", response_model=List[SupplierSchema])
def get_suppliers(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    suppliers = db.query(Supplier).all()
    return suppliers

@router.post("/", response_model=SupplierSchema)
def create_supplier(
    supplier: SupplierCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    db_supplier = Supplier(**supplier.model_dump())
    db.add(db_supplier)
    db.commit()
    db.refresh(db_supplier)
    return db_supplier

@router.get("/{supplier_id}", response_model=SupplierSchema)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@router.put("/{supplier_id}", response_model=SupplierSchema)
def update_supplier(
    supplier_id: int,
    supplier: SupplierUpdate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    db_supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not db_supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    update_data = supplier.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_supplier, key, value)
        
    db.add(db_supplier)
    db.commit()
    db.refresh(db_supplier)
    return db_supplier

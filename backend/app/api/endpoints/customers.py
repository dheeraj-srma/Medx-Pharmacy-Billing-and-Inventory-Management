from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app.models.customer import Customer
from app.schemas.customer import Customer as CustomerSchema, CustomerCreate, CustomerUpdate

router = APIRouter()

@router.get("/", response_model=List[CustomerSchema])
def get_customers(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    customers = db.query(Customer).all()
    return customers

@router.post("/", response_model=CustomerSchema)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.get("/{customer_id}", response_model=CustomerSchema)
def get_customer(
    customer_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.put("/{customer_id}", response_model=CustomerSchema)
def update_customer(
    customer_id: int,
    customer: CustomerUpdate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    update_data = customer.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_customer, key, value)
        
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

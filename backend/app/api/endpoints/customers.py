from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.api import deps
from app.models.customer import Customer
from app.models.user import RoleEnum
from app.schemas.customer import Customer as CustomerSchema, CustomerCreate, CustomerUpdate

router = APIRouter()

@router.get("/", response_model=List[CustomerSchema])
def get_customers(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    query = db.query(Customer)
    if current_user.role == RoleEnum.SUPERADMIN:
        if branch_id:
            query = query.filter(Customer.branch_id == branch_id)
    else:
        query = query.filter(Customer.branch_id == current_user.branch_id)
        
    customers = query.all()
    return customers

@router.post("/", response_model=CustomerSchema)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    if current_user.role == RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin has read-only access and cannot create customers."
        )
        
    db_customer = Customer(**customer.model_dump(), branch_id=current_user.branch_id)
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
        
    if current_user.role != RoleEnum.SUPERADMIN and customer.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")
        
    return customer

@router.put("/{customer_id}", response_model=CustomerSchema)
def update_customer(
    customer_id: int,
    customer: CustomerUpdate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    if current_user.role == RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin has read-only access and cannot update customers."
        )
        
    db_customer = db.query(Customer).filter(
        Customer.id == customer_id
    ).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    if db_customer.branch_id != current_user.branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this branch's data.")
    
    update_data = customer.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_customer, key, value)
        
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

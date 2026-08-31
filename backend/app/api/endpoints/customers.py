from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.api import deps
from app.models.customer import Customer
from app.models.user import RoleEnum
from app.schemas.customer import Customer as CustomerSchema, CustomerCreate, CustomerUpdate
from app.utils.phone import normalize_phone
from app.core.timezone import IST

router = APIRouter()

@router.get("/", response_model=List[CustomerSchema])
def get_customers(
    branch_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    query = db.query(Customer)
    if authorized_branch is not None:
        query = query.filter(Customer.branch_id == authorized_branch)
        
    if search:
        s = search.strip()
        _, norm_search = normalize_phone(s)
        if norm_search:
            query = query.filter(
                (Customer.name.ilike(f"%{s}%")) |
                (Customer.phone_normalized.like(f"%{norm_search}%")) |
                (Customer.phone.like(f"%{s}%"))
            )
        else:
            query = query.filter(
                (Customer.name.ilike(f"%{s}%")) |
                (Customer.phone.like(f"%{s}%"))
            )
            
    customers = query.order_by(Customer.id.desc()).all()
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
        
    user_branch_id = deps.require_user_branch_id(current_user)
    phone_raw, phone_norm = normalize_phone(customer.phone)
    
    # Deduplication check by phone_normalized within branch
    if phone_norm:
        existing = db.query(Customer).filter(
            Customer.branch_id == user_branch_id,
            Customer.phone_normalized == phone_norm
        ).first()
        if existing:
            # Update customer details if provided
            if customer.name and customer.name.strip() and not customer.name.startswith("Customer ("):
                existing.name = customer.name.strip()
            if customer.doctor_name:
                existing.doctor_name = customer.doctor_name
            if customer.address:
                existing.address = customer.address
            if customer.email:
                existing.email = customer.email
            if customer.whatsapp_opt_in:
                existing.whatsapp_opt_in = True
                existing.whatsapp_opt_in_at = datetime.now(IST)
            db.commit()
            db.refresh(existing)
            return existing

    db_customer = Customer(
        name=customer.name.strip(),
        phone=phone_raw,
        phone_raw=phone_raw,
        phone_normalized=phone_norm,
        email=customer.email,
        address=customer.address,
        doctor_name=customer.doctor_name,
        whatsapp_opt_in=customer.whatsapp_opt_in,
        whatsapp_opt_in_at=datetime.now(IST) if customer.whatsapp_opt_in else None,
        branch_id=user_branch_id
    )
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
    if "phone" in update_data:
        raw, norm = normalize_phone(update_data["phone"])
        db_customer.phone = raw
        db_customer.phone_raw = raw
        db_customer.phone_normalized = norm
        del update_data["phone"]
        
    if update_data.get("whatsapp_opt_in") and not db_customer.whatsapp_opt_in:
        db_customer.whatsapp_opt_in_at = datetime.now(IST)

    for key, value in update_data.items():
        setattr(db_customer, key, value)
        
    db.commit()
    db.refresh(db_customer)
    return db_customer

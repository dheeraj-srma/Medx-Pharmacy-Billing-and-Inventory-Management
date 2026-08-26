from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.product import Product, Category
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.schemas.product import ProductCreate, ProductResponse, CategoryCreate, CategoryResponse, ProductUpdate
from app.models.user import User
from app.api.deps import get_current_active_user, get_current_active_admin

router = APIRouter()

# --- CATEGORIES ---

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)) -> Any:
    return db.query(Category).offset(skip).limit(limit).all()

@router.post("/categories", response_model=CategoryResponse)
def create_category(
    *,
    db: Session = Depends(get_db),
    category_in: CategoryCreate,
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    category = db.query(Category).filter(Category.name == category_in.name).first()
    if category:
        raise HTTPException(status_code=400, detail="Category already exists")
    db_category = Category(**category_in.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

# --- PRODUCTS ---

@router.get("/", response_model=List[ProductResponse])
def get_products(
    skip: int = 0, 
    limit: int = 100, 
    category_id: int = None,
    search: str = None,
    db: Session = Depends(get_db)
) -> Any:
    query = db.query(Product)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    return query.offset(skip).limit(limit).all()

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import Optional
from datetime import date
import uuid
import os
import shutil

@router.post("/", response_model=ProductResponse)
def create_product(
    *,
    db: Session = Depends(get_db),
    name: str = Form(...),
    generic_name: Optional[str] = Form(None),
    brand: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    manufacturer: Optional[str] = Form(None),
    pack_size: Optional[str] = Form(None),
    mrp: float = Form(...),
    selling_price: float = Form(...),
    reorder_level: int = Form(10),
    barcode: Optional[str] = Form(None),
    sku: Optional[str] = Form(None),
    hsn_code: Optional[str] = Form(None),
    gst_percentage: float = Form(0.0),
    prescription_required: bool = Form(False),
    is_active: bool = Form(True),
    category_id: Optional[int] = Form(None),
    initial_stock: Optional[int] = Form(None),
    manufacturing_date: Optional[date] = Form(None),
    batch_number: Optional[str] = Form(None),
    expiry_date: Optional[date] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    
    # Validation for initial stock
    if initial_stock and initial_stock > 0:
        if not batch_number or not expiry_date:
            raise HTTPException(status_code=400, detail="Batch number and expiry date are required when initial stock is provided.")

    image_url = None
    if image and image.filename:
        if not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        UPLOAD_DIR = "uploads/products"
        if not os.path.exists(UPLOAD_DIR):
            os.makedirs(UPLOAD_DIR)
            
        file_extension = image.filename.split(".")[-1]
        unique_filename = f"product_{uuid.uuid4()}_{image.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"/uploads/products/{unique_filename}"

    try:
        db_product = Product(
            name=name,
            generic_name=generic_name,
            brand=brand,
            description=description,
            manufacturer=manufacturer,
            pack_size=pack_size,
            mrp=mrp,
            selling_price=selling_price,
            reorder_level=reorder_level,
            barcode=barcode,
            sku=sku,
            hsn_code=hsn_code,
            gst_percentage=gst_percentage,
            prescription_required=prescription_required,
            is_active=is_active,
            category_id=category_id,
            image_url=image_url
        )
        db.add(db_product)
        db.flush()
        
        if initial_stock and initial_stock > 0:
            batch = InventoryBatch(
                product_id=db_product.id,
                batch_number=batch_number,
                manufacturing_date=manufacturing_date,
                expiry_date=expiry_date,
                quantity_available=initial_stock,
                purchase_price=0.0,
                mrp=mrp,
                selling_price=selling_price
            )
            db.add(batch)
            db.flush()
            
            transaction = InventoryTransaction(
                product_id=db_product.id,
                batch_id=batch.id,
                quantity_change=initial_stock,
                transaction_type=TransactionTypeEnum.INITIAL_STOCK,
                reference_type="InitialStock",
                reference_id=str(db_product.id),
                notes="Initial stock added during product creation",
                user_id=current_user.id
            )
            db.add(transaction)
            
        db.commit()
        db.refresh(db_product)
        return db_product
    except Exception as e:
        db.rollback()
        # Clean up uploaded file on failure
        if image_url:
            try:
                os.remove(os.path.join(UPLOAD_DIR, image_url.split("/")[-1]))
            except:
                pass
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{id}", response_model=ProductResponse)
def get_product(id: int, db: Session = Depends(get_db)) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.put("/{id}", response_model=ProductResponse)
def update_product(
    *,
    id: int,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = product_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)
        
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.delete("/{id}", response_model=ProductResponse)
def delete_product(
    *,
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product.is_active = False
    product.is_archived = True
    
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

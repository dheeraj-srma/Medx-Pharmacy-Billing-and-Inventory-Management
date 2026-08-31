from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import date
import uuid
import os
import shutil

from app.database.database import get_db
from app.models.product import Product, Category
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.schemas.product import ProductCreate, ProductResponse, CategoryCreate, CategoryResponse, ProductUpdate
from app.models.user import User
from app.api.deps import get_current_active_user, get_current_active_admin

# --- Data Integrity Layer ---
from app.validation.products import validate_product
from app.validation.inventory import validate_inventory_batch
from app.services.validation_service import Severity
from app.services import fallback_service
from app.services import data_integrity_service

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_data_integrity_response(db: Session, entity_id: int) -> Optional[dict]:
    """Build the data_integrity payload for a product response."""
    issues = data_integrity_service.get_issues_for_entity(db, "product", entity_id)
    if not issues:
        return None
    return {
        "is_incomplete": True,
        "issues": [
            {
                "field": i.field_name,
                "severity": i.severity.value,
                "message": i.message,
            }
            for i in issues
        ],
    }


def _product_response(db: Session, product: Product) -> dict:
    """Convert a product ORM object to a dict with data_integrity embedded."""
    data = {
        "id": product.id,
        "name": product.name,
        "generic_name": product.generic_name,
        "brand": product.brand,
        "description": product.description,
        "manufacturer": product.manufacturer,
        "pack_size": product.pack_size,
        "image_url": product.image_url,
        "mrp": product.mrp,
        "selling_price": product.selling_price,
        "reorder_level": product.reorder_level,
        "barcode": product.barcode,
        "sku": product.sku,
        "hsn_code": product.hsn_code,
        "gst_percentage": product.gst_percentage,
        "prescription_required": product.prescription_required,
        "is_active": product.is_active,
        "is_archived": product.is_archived,
        "category_id": product.category_id,
        "category": product.category,
        "data_integrity": _build_data_integrity_response(db, product.id),
    }
    return data


# ---------------------------------------------------------------------------
# CATEGORIES
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)) -> Any:
    return db.query(Category).offset(skip).limit(limit).all()


@router.post("/categories", response_model=CategoryResponse)
def create_category(
    *,
    db: Session = Depends(get_db),
    category_in: CategoryCreate,
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    category = db.query(Category).filter(Category.name == category_in.name).first()
    if category:
        raise HTTPException(status_code=400, detail="Category already exists")
    db_category = Category(**category_in.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


# ---------------------------------------------------------------------------
# PRODUCTS — List & Get
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[ProductResponse])
def get_products(
    skip: int = 0,
    limit: int = 100,
    category_id: int = None,
    search: str = None,
    db: Session = Depends(get_db),
) -> Any:
    query = db.query(Product)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    products = query.offset(skip).limit(limit).all()
    # Attach data_integrity to each product
    result = []
    for p in products:
        d = _product_response(db, p)
        result.append(d)
    return result


@router.get("/{id}", response_model=ProductResponse)
def get_product(id: int, db: Session = Depends(get_db)) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _product_response(db, product)


# ---------------------------------------------------------------------------
# PRODUCTS — Create
# ---------------------------------------------------------------------------

@router.post("/")
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
    current_user: User = Depends(get_current_active_admin),
) -> Any:

    # ------------------------------------------------------------------
    # 1. Product validation
    # ------------------------------------------------------------------
    product_validation = validate_product(
        name=name,
        mrp=mrp,
        selling_price=selling_price,
        reorder_level=reorder_level,
        gst_percentage=gst_percentage,
        generic_name=generic_name,
        brand=brand,
        manufacturer=manufacturer,
        pack_size=pack_size,
        barcode=barcode,
        sku=sku,
        hsn_code=hsn_code,
        description=description,
    )

    if not product_validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=product_validation.to_api_error(),
        )

    # Apply normalizations to product fields
    normalized = product_validation.get_normalized_values()
    name = normalized.get("name", name)
    generic_name = normalized.get("generic_name", generic_name)
    brand = normalized.get("brand", brand)
    manufacturer = normalized.get("manufacturer", manufacturer)

    # ------------------------------------------------------------------
    # 2. Inventory batch validation (only if initial_stock > 0)
    # ------------------------------------------------------------------
    batch_validation = None
    resolved_batch_number = batch_number
    resolved_expiry_date = expiry_date

    if initial_stock and initial_stock > 0:
        batch_validation = validate_inventory_batch(
            quantity=initial_stock,
            expiry_date=expiry_date,
            batch_number=batch_number,
            manufacturing_date=manufacturing_date,
        )

        if not batch_validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=batch_validation.to_api_error(),
            )

        # Apply fallback placeholders for missing fields
        placeholders = batch_validation.get_placeholders()
        if "batch_number" in placeholders:
            resolved_batch_number = placeholders["batch_number"]
        if "expiry_date" in placeholders:
            from datetime import date as dt_date
            resolved_expiry_date = dt_date(9999, 12, 31)

    # ------------------------------------------------------------------
    # 3. Image upload
    # ------------------------------------------------------------------
    image_url = None
    UPLOAD_DIR = "uploads/products"
    if image and image.filename:
        if not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        if not os.path.exists(UPLOAD_DIR):
            os.makedirs(UPLOAD_DIR)
        file_extension = image.filename.split(".")[-1]
        unique_filename = f"product_{uuid.uuid4()}_{image.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"/uploads/products/{unique_filename}"

    # ------------------------------------------------------------------
    # 4. Persist everything in one transaction
    # ------------------------------------------------------------------
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
            image_url=image_url,
        )
        db.add(db_product)
        db.flush()  # get db_product.id

        # --- Data integrity issues for the product ---
        product_issue_fields = [
            i for i in product_validation.issues
            if i.severity in (Severity.MISSING, Severity.WARNING)
        ]
        data_integrity_service.create_issues_from_validation(
            db=db,
            entity_type="product",
            entity_id=db_product.id,
            field_issues=product_issue_fields,
            branch_id=current_user.branch_id,
        )

        # --- Inventory batch ---
        if initial_stock and initial_stock > 0:
            batch = InventoryBatch(
                product_id=db_product.id,
                batch_number=resolved_batch_number,
                manufacturing_date=manufacturing_date,
                expiry_date=resolved_expiry_date,
                quantity_available=initial_stock,
                purchase_price=0.0,
                mrp=mrp,
                selling_price=selling_price,
                branch_id=current_user.branch_id,
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
                user_id=current_user.id,
                branch_id=current_user.branch_id,
            )
            db.add(transaction)

            # --- Data integrity issues for the batch ---
            if batch_validation:
                batch_issue_fields = [
                    i for i in batch_validation.issues
                    if i.severity in (Severity.MISSING, Severity.WARNING)
                ]
                data_integrity_service.create_issues_from_validation(
                    db=db,
                    entity_type="inventory_batch",
                    entity_id=batch.id,
                    field_issues=batch_issue_fields,
                    branch_id=current_user.branch_id,
                )

        db.commit()
        db.refresh(db_product)
        return _product_response(db, db_product)

    except Exception as e:
        db.rollback()
        # Clean up uploaded file on failure
        if image_url:
            try:
                os.remove(os.path.join(UPLOAD_DIR, image_url.split("/")[-1]))
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# PRODUCTS — Update
# ---------------------------------------------------------------------------

@router.put("/{id}", response_model=ProductResponse)
def update_product(
    *,
    id: int,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = product_in.model_dump(exclude_unset=True)

    # Validate fields being updated
    if "mrp" in update_data or "selling_price" in update_data or "name" in update_data:
        check_name = update_data.get("name", product.name)
        check_mrp = update_data.get("mrp", product.mrp)
        check_sp = update_data.get("selling_price", product.selling_price)
        check_rl = update_data.get("reorder_level", product.reorder_level)
        check_gst = update_data.get("gst_percentage", product.gst_percentage)

        val = validate_product(
            name=check_name,
            mrp=check_mrp,
            selling_price=check_sp,
            reorder_level=check_rl,
            gst_percentage=check_gst,
        )
        if not val.is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=val.to_api_error(),
            )

        # Apply normalized values
        normalized = val.get_normalized_values()
        update_data.update(normalized)

    for field, value in update_data.items():
        setattr(product, field, value)

    # Auto-resolve any issues for updated fields
    for field_name in update_data.keys():
        data_integrity_service.auto_resolve_field(
            db=db,
            entity_type="product",
            entity_id=id,
            field_name=field_name,
            resolved_by_user_id=current_user.id,
        )

    db.add(product)
    db.commit()
    db.refresh(product)
    return _product_response(db, product)


# ---------------------------------------------------------------------------
# PRODUCTS — Image upload
# ---------------------------------------------------------------------------

@router.post("/{id}/image", response_model=ProductResponse)
def upload_product_image(
    *,
    id: int,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    UPLOAD_DIR = "uploads/products"
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)

    unique_filename = f"product_{uuid.uuid4()}_{image.filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    if product.image_url:
        old_path = os.path.join("uploads/products", product.image_url.split("/")[-1])
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass

    product.image_url = f"/uploads/products/{unique_filename}"
    db.add(product)
    db.commit()
    db.refresh(product)
    return _product_response(db, product)


# ---------------------------------------------------------------------------
# PRODUCTS — Archive/Delete
# ---------------------------------------------------------------------------

@router.delete("/{id}", response_model=ProductResponse)
def delete_product(
    *,
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.is_active = False
    product.is_archived = True

    db.add(product)
    db.commit()
    db.refresh(product)
    return _product_response(db, product)

import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

logger = logging.getLogger("purchase_service")

from app.core.timezone import IST
from app.models.purchase import Purchase, PurchaseItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.purchase import PurchaseCreate
from app.services.fallback_service import is_placeholder, is_expiry_placeholder

def round_money(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

class PurchaseService:
    @staticmethod
    def create_purchase(
        db: Session,
        purchase_in: PurchaseCreate,
        current_user: User
    ) -> Purchase:
        branch_id = current_user.branch_id
        if not branch_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must be assigned to an active pharmacy branch to record inward stock."
            )

        if not purchase_in.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Purchase must contain at least one item."
            )

        # Validate supplier
        supplier = db.query(Supplier).filter(Supplier.id == purchase_in.supplier_id).first()
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Supplier ID {purchase_in.supplier_id} not found."
            )

        try:
            subtotal = Decimal("0.00")
            total_tax = Decimal("0.00")

            # 1. Authoritatively compute item totals and taxes
            validated_items = []
            for item in purchase_in.items:
                product = db.query(Product).filter(
                    Product.id == item.product_id,
                    Product.is_active == True
                ).first()
                if not product:
                    raise ValueError(f"Product ID {item.product_id} not found or inactive.")

                if item.manufacturing_date and item.expiry_date and item.expiry_date <= item.manufacturing_date:
                    raise ValueError(f"Expiry date must be after manufacturing date for product {product.name}.")

                p_price = round_money(Decimal(str(item.purchase_price)))
                p_mrp = round_money(Decimal(str(item.mrp)))
                p_selling = round_money(Decimal(str(item.selling_price)))

                if p_selling > p_mrp:
                    raise ValueError(f"Selling price ({p_selling}) cannot exceed MRP ({p_mrp}) for product {product.name}.")

                gst_percentage = Decimal(str(product.gst_percentage or "0.00"))
                gst_rate = gst_percentage / Decimal("100.0")

                line_cost = round_money(p_price * Decimal(item.quantity))
                line_tax = round_money(line_cost * gst_rate)

                subtotal += line_cost
                total_tax += line_tax

                validated_items.append({
                    "item": item,
                    "product": product,
                    "purchase_price": p_price,
                    "mrp": p_mrp,
                    "selling_price": p_selling
                })

            discount_amount = round_money(Decimal(str(purchase_in.discount_amount or "0.00")))
            grand_total = max(Decimal("0.00"), subtotal + total_tax - discount_amount)

            # 2. Persist Purchase Header
            purchase = Purchase(
                supplier_id=purchase_in.supplier_id,
                invoice_number=purchase_in.invoice_number,
                purchase_date=purchase_in.purchase_date,
                total_amount=subtotal,
                tax_amount=total_tax,
                discount_amount=discount_amount,
                grand_total=grand_total,
                notes=purchase_in.notes,
                branch_id=branch_id,
                created_by=current_user.id,
                created_at=datetime.now(IST)
            )
            db.add(purchase)
            db.flush()

            # 3. Persist Purchase Items, Update Inventory Batches & Ledger
            for val_data in validated_items:
                item = val_data["item"]
                product = val_data["product"]

                purchase_item = PurchaseItem(
                    purchase_id=purchase.id,
                    product_id=item.product_id,
                    batch_number=item.batch_number.strip(),
                    manufacturing_date=item.manufacturing_date,
                    expiry_date=item.expiry_date,
                    quantity=item.quantity,
                    purchase_price=val_data["purchase_price"],
                    mrp=val_data["mrp"],
                    selling_price=val_data["selling_price"]
                )
                db.add(purchase_item)

                # Find or create batch with row locking
                batch = db.query(InventoryBatch).filter(
                    InventoryBatch.product_id == item.product_id,
                    InventoryBatch.batch_number == item.batch_number.strip(),
                    InventoryBatch.branch_id == branch_id
                ).with_for_update().first()

                is_placeholder_exp = is_expiry_placeholder(str(item.expiry_date))
                is_placeholder_bt = is_placeholder(item.batch_number)

                if not batch:
                    batch = InventoryBatch(
                        product_id=item.product_id,
                        batch_number=item.batch_number.strip(),
                        manufacturing_date=item.manufacturing_date,
                        expiry_date=item.expiry_date,
                        quantity_available=item.quantity,
                        purchase_price=val_data["purchase_price"],
                        mrp=val_data["mrp"],
                        selling_price=val_data["selling_price"],
                        supplier_id=purchase_in.supplier_id,
                        branch_id=branch_id,
                        is_placeholder_expiry=is_placeholder_exp,
                        is_placeholder_batch=is_placeholder_bt,
                        created_at=datetime.now(IST)
                    )
                    db.add(batch)
                    db.flush()
                else:
                    batch.purchase_price = val_data["purchase_price"]
                    batch.mrp = val_data["mrp"]
                    batch.selling_price = val_data["selling_price"]
                    batch.supplier_id = purchase_in.supplier_id
                    batch.quantity_available += item.quantity
                    batch.updated_at = datetime.now(IST)

                # Inventory Transaction Ledger
                txn = InventoryTransaction(
                    product_id=item.product_id,
                    batch_id=batch.id,
                    quantity_change=item.quantity,
                    transaction_type=TransactionTypeEnum.PURCHASE,
                    reference_type="Purchase",
                    reference_id=str(purchase.id),
                    notes=f"Inward Stock Invoice: {purchase_in.invoice_number or purchase.id}",
                    user_id=current_user.id,
                    branch_id=branch_id,
                    timestamp=datetime.now(IST)
                )
                db.add(txn)

            # Audit Log
            from app.services.audit_service import AuditService
            AuditService.log(
                db=db,
                action="PURCHASE_CREATED",
                user_id=current_user.id,
                branch_id=branch_id,
                entity_type="purchase",
                entity_id=purchase.id,
                new_value={"invoice_number": purchase.invoice_number, "grand_total": str(grand_total), "items_count": len(validated_items)}
            )

            db.commit()
            db.refresh(purchase)
            return purchase

        except (ValueError, HTTPException) as ve:
            db.rollback()
            if isinstance(ve, HTTPException):
                raise ve
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
        except Exception as e:
            db.rollback()
            logger.exception("Purchase transaction failed unexpectedly")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Inward stock transaction failed due to an internal error. Please try again or contact support."
            )

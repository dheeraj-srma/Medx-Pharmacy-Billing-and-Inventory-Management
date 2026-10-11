import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

logger = logging.getLogger("sales_service")

from app.core.timezone import IST
from app.models.sale import Sale, SaleItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.product import Product
from app.models.payment import Payment, PaymentMethodEnum, PaymentStatusEnum
from app.models.user import User, RoleEnum
from app.schemas.sale import SaleCreate, SalePreviewResponse, SaleItemResponse
from app.services.invoice_service import generate_sequential_invoice_number
from app.services.pricing_service import PricingService

def round_money(val: Decimal) -> Decimal:
    """Helper to ensure currency values are strictly rounded to 2 decimal places."""
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

class SalesService:
    @staticmethod
    def create_sale(
        db: Session,
        sale_in: SaleCreate,
        current_user: User
    ) -> Sale:
        """
        Authoritative Sale Creation with FEFO and Concurrency Protection.
        Executes within a single atomic database transaction with row locking.
        Uses PricingService for GST-inclusive price extraction and calculations.
        """
        if current_user.role in (RoleEnum.SUPERADMIN, RoleEnum.ADMIN):
            branch_id = sale_in.branch_id or current_user.branch_id or 1
        else:
            branch_id = current_user.branch_id

        if not branch_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid pharmacy branch must be specified to process sales."
            )

        from app.models.branch import Branch
        branch = db.query(Branch).filter(Branch.id == branch_id).first()
        if not branch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Branch ID {branch_id} does not exist."
            )

        # Check Backdate Billing Permissions and Effective Sale Date
        from app.models.settings import StoreSettings
        store_settings = db.query(StoreSettings).filter(StoreSettings.branch_id == branch_id).first()
        allow_backdated = bool(store_settings.allow_backdated_billing) if store_settings else False

        effective_sale_date = datetime.now(IST)
        if sale_in.sale_date is not None:
            if not allow_backdated:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Backdated billing is currently disabled in store settings for this branch."
                )
            req_dt = sale_in.sale_date
            if req_dt.tzinfo is None:
                effective_sale_date = req_dt.replace(tzinfo=IST)
            else:
                effective_sale_date = req_dt.astimezone(IST)

            if effective_sale_date.date() > datetime.now(IST).date():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Backdated billing cannot specify a future date."
                )

        if not sale_in.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create an empty sale without line items."
            )

        today = date.today()
        allocated_items = []

        try:
            # 1. FEFO & Inventory Row Locking
            for req_item in sale_in.items:
                product = db.query(Product).filter(
                    Product.id == req_item.product_id,
                    Product.is_active == True,
                    Product.is_archived == False
                ).first()
                if not product:
                    raise ValueError(f"Product ID {req_item.product_id} not found or inactive.")

                requested_qty = Decimal(str(req_item.quantity))
                gst_percentage = Decimal(str(product.gst_percentage or "0.00"))

                if req_item.batch_id:
                    # Specific batch requested — lock and validate
                    batch = db.query(InventoryBatch).filter(
                        InventoryBatch.id == req_item.batch_id,
                        InventoryBatch.branch_id == branch_id
                    ).with_for_update().first()

                    if not batch:
                        raise ValueError(f"Batch ID {req_item.batch_id} not found in this branch.")
                    if batch.product_id != product.id:
                        raise ValueError(f"Batch ID {req_item.batch_id} does not belong to {product.name}.")
                    if batch.expiry_date < today:
                        raise ValueError(f"Batch {batch.batch_number} for {product.name} is expired.")
                    if batch.is_placeholder_expiry:
                        raise ValueError(f"Batch {batch.batch_number} has an unresolved expiry date and cannot be sold.")
                    
                    batch_avail = Decimal(str(batch.quantity_available))
                    if batch_avail < requested_qty:
                        raise ValueError(
                            f"Insufficient stock for {product.name} (Batch {batch.batch_number}). "
                            f"Available: {batch_avail}, Requested: {requested_qty}"
                        )

                    batch.quantity_available = batch_avail - requested_qty
                    unit_price = round_money(Decimal(str(batch.selling_price)))
                    batch_mrp = round_money(Decimal(str(batch.mrp if batch.mrp and batch.mrp > 0 else (product.mrp or unit_price))))
                    item_discount = round_money(Decimal(str(req_item.discount or "0.00")))

                    allocated_items.append({
                        "product_id": product.id,
                        "batch_id": batch.id,
                        "quantity": requested_qty,
                        "unit_price": unit_price,
                        "mrp": batch_mrp,
                        "gst_percentage": gst_percentage,
                        "discount": item_discount,
                        "batch": batch,
                        "product": product
                    })
                else:
                    # Automatic Real FEFO Allocation with row locking
                    candidate_batches = db.query(InventoryBatch).filter(
                        InventoryBatch.product_id == product.id,
                        InventoryBatch.branch_id == branch_id,
                        InventoryBatch.quantity_available > 0,
                        InventoryBatch.expiry_date >= today,
                        InventoryBatch.is_placeholder_expiry == False
                    ).order_by(
                        InventoryBatch.expiry_date.asc(),
                        InventoryBatch.id.asc()
                    ).with_for_update().all()

                    total_available = sum(Decimal(str(b.quantity_available)) for b in candidate_batches)
                    if total_available < requested_qty:
                        raise ValueError(
                            f"Insufficient stock for '{product.name}'. "
                            f"Available: {total_available} units, Requested: {requested_qty} units."
                        )

                    remaining_needed = requested_qty
                    for batch in candidate_batches:
                        if remaining_needed <= Decimal("0.00"):
                            break
                        batch_avail = Decimal(str(batch.quantity_available))
                        take = min(batch_avail, remaining_needed)
                        batch.quantity_available = batch_avail - take
                        remaining_needed -= take

                        unit_price = round_money(Decimal(str(batch.selling_price)))
                        batch_mrp = round_money(Decimal(str(batch.mrp if batch.mrp and batch.mrp > 0 else (product.mrp or unit_price))))
                        # Pro-rate discount if any
                        item_discount = round_money(Decimal(str(req_item.discount or "0.00")) * (take / requested_qty))

                        allocated_items.append({
                            "product_id": product.id,
                            "batch_id": batch.id,
                            "quantity": take,
                            "unit_price": unit_price,
                            "mrp": batch_mrp,
                            "gst_percentage": gst_percentage,
                            "discount": item_discount,
                            "batch": batch,
                            "product": product
                        })

            # 2. Authoritative Order Level Discounts and GST Calculation via PricingService
            cart_raw_items = [
                {
                    "product_id": alloc["product_id"],
                    "batch_id": alloc["batch_id"],
                    "quantity": alloc["quantity"],
                    "mrp": alloc["mrp"],
                    "selling_price": alloc["unit_price"],
                    "gst_percentage": alloc["gst_percentage"],
                    "discount": alloc["discount"],
                    "product_name": alloc["product"].name,
                    "batch_number": alloc["batch"].batch_number,
                    "hsn_code": alloc["product"].hsn_code,
                }
                for alloc in allocated_items
            ]

            cart_result = PricingService.calculate_cart(
                items=cart_raw_items,
                discount_percent=Decimal(str(sale_in.discount_percent or "0.00")),
                discount_amount=Decimal(str(sale_in.discount_amount or "0.00")),
                is_interstate=False
            )

            subtotal = cart_result["subtotal"]
            total_tax = cart_result["tax_amount"]
            order_discount = cart_result["order_discount"]
            round_off = cart_result["round_off"]
            grand_total = cart_result["grand_total"]

            # 3. Generate Sequential Invoice Number (Locked with row lock in sequence table)
            invoice_number = generate_sequential_invoice_number(db, branch_id=branch_id, dt=effective_sale_date)

            # 4. Persist Sale Header
            sale = Sale(
                invoice_number=invoice_number,
                customer_id=sale_in.customer_id,
                total_amount=subtotal,
                tax_amount=total_tax,
                discount_amount=order_discount,
                round_off=round_off,
                grand_total=grand_total,
                payment_method=sale_in.payment_method or "Cash",
                status="COMPLETED",
                branch_id=branch_id,
                created_by=current_user.id,
                sale_date=effective_sale_date
            )
            db.add(sale)
            db.flush()

            # 5. Persist Sale Items & Inventory Transactions
            for alloc, calc_item in zip(allocated_items, cart_result["items"]):
                sale_item = SaleItem(
                    sale_id=sale.id,
                    product_id=alloc["product_id"],
                    batch_id=alloc["batch_id"],
                    quantity=alloc["quantity"],
                    unit_price=alloc["unit_price"],
                    discount=alloc["discount"],
                    total_price=calc_item["effective_line_total"]
                )
                db.add(sale_item)

                txn = InventoryTransaction(
                    product_id=alloc["product_id"],
                    batch_id=alloc["batch_id"],
                    quantity_change=-alloc["quantity"],
                    transaction_type=TransactionTypeEnum.SALE,
                    reference_type="Sale",
                    reference_id=str(sale.id),
                    notes=f"Sale Invoice: {invoice_number}",
                    user_id=current_user.id,
                    branch_id=branch_id,
                    timestamp=effective_sale_date
                )
                db.add(txn)

            # 6. Persist Payments with Strict Financial Reconciliation
            if sale_in.payments:
                total_paid = Decimal("0.00")
                payments_to_add = []
                for p_req in sale_in.payments:
                    p_amt = round_money(p_req.amount) if p_req.amount is not None else grand_total
                    if p_amt <= Decimal("0.00"):
                        raise ValueError(f"Payment amount must be greater than zero. Received: {p_amt}")
                    total_paid += p_amt
                    payments_to_add.append((p_req, p_amt))

                if total_paid != grand_total:
                    raise ValueError(
                        f"Payment total ({total_paid}) does not reconcile with sale grand total ({grand_total}). "
                        f"Difference: {total_paid - grand_total}"
                    )

                for p_req, p_amt in payments_to_add:
                    payment = Payment(
                        sale_id=sale.id,
                        branch_id=branch_id,
                        method=p_req.method,
                        amount=p_amt,
                        status=PaymentStatusEnum.COMPLETED,
                        reference_number=p_req.reference_number,
                        created_at=effective_sale_date
                    )
                    db.add(payment)
            else:
                # Default single payment
                method_name = (sale_in.payment_method or "CASH").upper()
                try:
                    p_method = PaymentMethodEnum(method_name)
                except ValueError:
                    p_method = PaymentMethodEnum.CASH

                payment = Payment(
                    sale_id=sale.id,
                    branch_id=branch_id,
                    method=p_method,
                    amount=grand_total,
                    status=PaymentStatusEnum.COMPLETED,
                    created_at=effective_sale_date
                )
                db.add(payment)

            # 7. Audit Log
            from app.services.audit_service import AuditService
            AuditService.log(
                db=db,
                action="SALE_CREATED",
                user_id=current_user.id,
                branch_id=branch_id,
                entity_type="sale",
                entity_id=sale.id,
                new_value={"invoice_number": invoice_number, "grand_total": str(grand_total), "items_count": len(allocated_items)}
            )

            # 8. Atomic Commit
            db.commit()
            db.refresh(sale)
            return sale

        except (ValueError, HTTPException) as ve:
            db.rollback()
            if isinstance(ve, HTTPException):
                raise ve
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
        except Exception as e:
            db.rollback()
            logger.exception("Sale transaction failed unexpectedly")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Sale transaction failed due to an internal error. Please try again or contact support."
            )

    @staticmethod
    def preview_sale(
        db: Session,
        sale_in: SaleCreate,
        current_user: User
    ) -> SalePreviewResponse:
        """
        Calculates prices, taxes, discounts, and FEFO allocation for UI preview
        without altering inventory or persisting records.
        """
        if current_user.role in (RoleEnum.SUPERADMIN, RoleEnum.ADMIN):
            branch_id = sale_in.branch_id or current_user.branch_id or 1
        else:
            branch_id = current_user.branch_id or 1
        today = date.today()
        raw_preview_items = []

        for req_item in sale_in.items:
            product = db.query(Product).filter(
                Product.id == req_item.product_id,
                Product.is_active == True
            ).first()
            if not product:
                continue

            requested_qty = Decimal(str(req_item.quantity))
            gst_percentage = Decimal(str(product.gst_percentage or "0.00"))

            batches = db.query(InventoryBatch).filter(
                InventoryBatch.product_id == product.id,
                InventoryBatch.branch_id == branch_id,
                InventoryBatch.quantity_available > 0,
                InventoryBatch.expiry_date >= today,
                InventoryBatch.is_placeholder_expiry == False
            ).order_by(
                InventoryBatch.expiry_date.asc(),
                InventoryBatch.id.asc()
            ).all()

            remaining = requested_qty
            for batch in batches:
                if remaining <= Decimal("0.00"):
                    break
                batch_avail = Decimal(str(batch.quantity_available))
                take = min(batch_avail, remaining)
                remaining -= take

                unit_price = round_money(Decimal(str(batch.selling_price)))
                batch_mrp = round_money(Decimal(str(batch.mrp if batch.mrp and batch.mrp > 0 else (product.mrp or unit_price))))
                item_discount = round_money(Decimal(str(req_item.discount or "0.00")) * (take / requested_qty))

                raw_preview_items.append({
                    "product_id": product.id,
                    "batch_id": batch.id,
                    "quantity": take,
                    "unit_price": unit_price,
                    "mrp": batch_mrp,
                    "gst_percentage": gst_percentage,
                    "discount": item_discount,
                    "batch_number": batch.batch_number,
                    "product_name": product.name,
                    "hsn_code": product.hsn_code,
                })

        cart_result = PricingService.calculate_cart(
            items=raw_preview_items,
            discount_percent=Decimal(str(sale_in.discount_percent or "0.00")),
            discount_amount=Decimal(str(sale_in.discount_amount or "0.00")),
            is_interstate=False,
        )

        preview_items = []
        for line in cart_result["items"]:
            preview_items.append(SaleItemResponse(
                id=0,
                sale_id=0,
                product_id=line["product_id"],
                batch_id=line["batch_id"],
                quantity=line["quantity"],
                unit_price=line["selling_price"],
                discount=line["additional_discount"],
                total_price=line["effective_line_total"],
                batch_number=line["batch_number"],
                product_name=line["product_name"],
                mrp=line["mrp"],
                hsn_code=line["hsn_code"],
                gst_percentage=line["gst_percentage"],
                taxable_amount=line["taxable_amount"],
                gst_amount=line["gst_amount"],
                cgst_amount=line["cgst_amount"],
                sgst_amount=line["sgst_amount"],
                mrp_discount_amount=line["mrp_line_discount"],
                mrp_discount_percent=line["mrp_discount_percent"],
            ))

        return SalePreviewResponse(
            total_amount=cart_result["subtotal"],
            tax_amount=cart_result["tax_amount"],
            discount_amount=cart_result["order_discount"],
            round_off=cart_result["round_off"],
            grand_total=cart_result["grand_total"],
            items=preview_items,
            total_mrp=cart_result["total_mrp"],
            total_mrp_discount=cart_result["total_mrp_discount"],
            overall_mrp_discount_percent=cart_result["overall_mrp_discount_percent"],
            taxable_amount=cart_result["taxable_amount"],
            tax_breakdown=cart_result["tax_breakdown"],
        )

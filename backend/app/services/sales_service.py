from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.timezone import IST
from app.models.sale import Sale, SaleItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.product import Product
from app.models.payment import Payment, PaymentMethodEnum, PaymentStatusEnum
from app.models.user import User
from app.schemas.sale import SaleCreate, SalePreviewResponse, SaleItemResponse
from app.services.invoice_service import generate_sequential_invoice_number

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
        """
        branch_id = current_user.branch_id
        if not branch_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must be assigned to an active pharmacy branch to process sales."
            )

        if not sale_in.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create an empty sale without line items."
            )

        today = date.today()
        allocated_items = []
        subtotal = Decimal("0.00")
        total_tax = Decimal("0.00")

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
                gst_rate = gst_percentage / Decimal("100.0")

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

                    batch.quantity_available = float(batch_avail - requested_qty)
                    unit_price = round_money(Decimal(str(batch.selling_price)))
                    item_discount = round_money(Decimal(str(req_item.discount or "0.00")))
                    gross_line = round_money(unit_price * requested_qty)
                    net_line = max(Decimal("0.00"), gross_line - item_discount)
                    line_tax = round_money(net_line * gst_rate)

                    subtotal += net_line
                    total_tax += line_tax

                    allocated_items.append({
                        "product_id": product.id,
                        "batch_id": batch.id,
                        "quantity": requested_qty,
                        "unit_price": unit_price,
                        "discount": item_discount,
                        "total_price": net_line,
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
                        batch.quantity_available = float(batch_avail - take)
                        remaining_needed -= take

                        unit_price = round_money(Decimal(str(batch.selling_price)))
                        # Pro-rate discount if any
                        item_discount = round_money(Decimal(str(req_item.discount or "0.00")) * (take / requested_qty))
                        gross_line = round_money(unit_price * take)
                        net_line = max(Decimal("0.00"), gross_line - item_discount)
                        line_tax = round_money(net_line * gst_rate)

                        subtotal += net_line
                        total_tax += line_tax

                        allocated_items.append({
                            "product_id": product.id,
                            "batch_id": batch.id,
                            "quantity": take,
                            "unit_price": unit_price,
                            "discount": item_discount,
                            "total_price": net_line,
                            "batch": batch,
                            "product": product
                        })

            # 2. Authoritative Order Level Discounts and Grand Total
            if sale_in.discount_percent and sale_in.discount_percent > Decimal("0.00"):
                discount_percent = Decimal(str(sale_in.discount_percent))
                order_discount = round_money(subtotal * (discount_percent / Decimal("100.0")))
            elif sale_in.discount_amount and sale_in.discount_amount > Decimal("0.00"):
                order_discount = round_money(Decimal(str(sale_in.discount_amount)))
            else:
                order_discount = Decimal("0.00")

            raw_grand_total = max(Decimal("0.00"), subtotal - order_discount + total_tax)
            # Auto round off to nearest integer
            rounded_grand_total = raw_grand_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))
            round_off = round_money(rounded_grand_total - raw_grand_total)
            grand_total = rounded_grand_total

            # 3. Generate Sequential Invoice Number (Locked with row lock in sequence table)
            invoice_number = generate_sequential_invoice_number(db, branch_id=branch_id)

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
                sale_date=datetime.now(IST)
            )
            db.add(sale)
            db.flush()

            # 5. Persist Sale Items & Inventory Transactions
            for alloc in allocated_items:
                sale_item = SaleItem(
                    sale_id=sale.id,
                    product_id=alloc["product_id"],
                    batch_id=alloc["batch_id"],
                    quantity=alloc["quantity"],
                    unit_price=alloc["unit_price"],
                    discount=alloc["discount"],
                    total_price=alloc["total_price"]
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
                    timestamp=datetime.now(IST)
                )
                db.add(txn)

            # 6. Persist Payments
            if sale_in.payments:
                total_paid = Decimal("0.00")
                for p_req in sale_in.payments:
                    p_amt = round_money(p_req.amount) if p_req.amount is not None else grand_total
                    total_paid += p_amt
                    payment = Payment(
                        sale_id=sale.id,
                        branch_id=branch_id,
                        method=p_req.method,
                        amount=p_amt,
                        status=PaymentStatusEnum.COMPLETED,
                        reference_number=p_req.reference_number
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
                    status=PaymentStatusEnum.COMPLETED
                )
                db.add(payment)

            # 7. Atomic Commit
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
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Sale transaction failed: {str(e)}"
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
        branch_id = current_user.branch_id or 1
        today = date.today()
        subtotal = Decimal("0.00")
        total_tax = Decimal("0.00")
        preview_items = []

        for req_item in sale_in.items:
            product = db.query(Product).filter(
                Product.id == req_item.product_id,
                Product.is_active == True
            ).first()
            if not product:
                continue

            requested_qty = Decimal(str(req_item.quantity))
            gst_percentage = Decimal(str(product.gst_percentage or "0.00"))
            gst_rate = gst_percentage / Decimal("100.0")

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
                item_discount = round_money(Decimal(str(req_item.discount or "0.00")) * (take / requested_qty))
                gross_line = round_money(unit_price * take)
                net_line = max(Decimal("0.00"), gross_line - item_discount)
                line_tax = round_money(net_line * gst_rate)

                subtotal += net_line
                total_tax += line_tax

                preview_items.append(SaleItemResponse(
                    id=0,
                    sale_id=0,
                    product_id=product.id,
                    batch_id=batch.id,
                    quantity=take,
                    unit_price=unit_price,
                    discount=item_discount,
                    total_price=net_line,
                    batch_number=batch.batch_number,
                    product_name=product.name
                ))

        if sale_in.discount_percent and sale_in.discount_percent > Decimal("0.00"):
            discount_percent = Decimal(str(sale_in.discount_percent))
            order_discount = round_money(subtotal * (discount_percent / Decimal("100.0")))
        elif sale_in.discount_amount and sale_in.discount_amount > Decimal("0.00"):
            order_discount = round_money(Decimal(str(sale_in.discount_amount)))
        else:
            order_discount = Decimal("0.00")

        raw_grand_total = max(Decimal("0.00"), subtotal - order_discount + total_tax)
        rounded_grand_total = raw_grand_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))
        round_off = round_money(rounded_grand_total - raw_grand_total)
        grand_total = rounded_grand_total

        return SalePreviewResponse(
            total_amount=subtotal,
            tax_amount=total_tax,
            discount_amount=order_discount,
            round_off=round_off,
            grand_total=grand_total,
            items=preview_items
        )

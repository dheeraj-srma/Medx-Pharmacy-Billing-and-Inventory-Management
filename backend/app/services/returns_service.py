import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.core.timezone import IST
from app.models.sale import Sale, SaleItem
from app.models.returns import Return, ReturnItem
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.user import User
from app.schemas.returns import ReturnCreate

logger = logging.getLogger("returns_service")

def round_money(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

class ReturnsService:
    @staticmethod
    def process_return(
        db: Session,
        return_in: ReturnCreate,
        current_user: User
    ) -> Return:
        """
        Authoritative Sale Return Processing.
        Executes within a single atomic database transaction:
        - Locks original sale
        - Validates returnable quantities (sold qty minus previously returned qty)
        - Calculates pro-rated refund amount
        - Restocks unexpired batches into inventory with RETURN transactions
        - Creates Return & ReturnItems records
        - Updates Sale status if fully or partially returned
        """
        branch_id = current_user.branch_id
        if not branch_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must be assigned to an active pharmacy branch to process returns."
            )

        if not return_in.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Return request must contain at least one line item."
            )

        try:
            # 1. Lock and validate the original sale
            sale = db.query(Sale).filter(
                Sale.id == return_in.sale_id,
                Sale.branch_id == branch_id
            ).with_for_update().first()

            if not sale:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Sale ID {return_in.sale_id} not found in this branch."
                )

            today = date.today()
            total_refund = Decimal("0.00")
            return_items_to_add = []

            # 2. Process each requested return item
            for req in return_in.items:
                sale_item = db.query(SaleItem).filter(
                    SaleItem.id == req.sale_item_id,
                    SaleItem.sale_id == sale.id
                ).first()

                if not sale_item:
                    raise ValueError(f"Sale item ID {req.sale_item_id} does not belong to Sale #{sale.invoice_number}.")

                return_qty = Decimal(str(req.quantity))
                if return_qty <= Decimal("0.00"):
                    raise ValueError(f"Return quantity must be positive. Received: {return_qty}")

                # Calculate already returned quantity for this sale_item
                already_returned = db.query(func.coalesce(func.sum(ReturnItem.quantity), Decimal("0.00"))).filter(
                    ReturnItem.sale_item_id == sale_item.id
                ).scalar()
                already_returned = Decimal(str(already_returned))

                sold_qty = Decimal(str(sale_item.quantity))
                max_returnable = sold_qty - already_returned

                if return_qty > max_returnable:
                    raise ValueError(
                        f"Cannot return {return_qty} units for sale item ID {sale_item.id}. "
                        f"Sold: {sold_qty}, Already returned: {already_returned}, Max returnable: {max_returnable}."
                    )

                # Compute pro-rated refund for this line
                effective_unit_price = round_money(Decimal(str(sale_item.total_price)) / sold_qty)
                item_refund = round_money(effective_unit_price * return_qty)
                total_refund += item_refund

                # 3. Restock inventory if requested
                batch = db.query(InventoryBatch).filter(
                    InventoryBatch.id == sale_item.batch_id,
                    InventoryBatch.branch_id == branch_id
                ).with_for_update().first()

                should_restock = req.restock_inventory
                if should_restock and batch:
                    # Check if batch has expired since the sale
                    if batch.expiry_date < today:
                        # Cannot restock expired batch into active inventory
                        should_restock = False
                        logger.warning(
                            f"Batch {batch.batch_number} for sale item {sale_item.id} is expired ({batch.expiry_date}). Skipping inventory restock."
                        )
                    else:
                        batch_avail = Decimal(str(batch.quantity_available))
                        batch.quantity_available = batch_avail + return_qty

                        # Record inventory transaction
                        txn = InventoryTransaction(
                            product_id=sale_item.product_id,
                            batch_id=batch.id,
                            quantity_change=return_qty,
                            transaction_type=TransactionTypeEnum.RETURN,
                            reference_type="Return",
                            reference_id=str(sale.id),
                            notes=f"Return against Sale Invoice: {sale.invoice_number}",
                            user_id=current_user.id,
                            branch_id=branch_id,
                            timestamp=datetime.now(IST)
                        )
                        db.add(txn)

                return_items_to_add.append({
                    "sale_item_id": sale_item.id,
                    "product_id": sale_item.product_id,
                    "batch_id": sale_item.batch_id,
                    "quantity": return_qty,
                    "refund_amount": item_refund,
                    "restock_inventory": should_restock,
                })

            # 4. Generate unique Return Number
            count_returns = db.query(func.count(Return.id)).filter(
                Return.sale_id == sale.id
            ).scalar() or 0
            return_number = f"RET-{sale.invoice_number}-{count_returns + 1}"

            # 5. Persist Return Header
            return_order = Return(
                sale_id=sale.id,
                branch_id=branch_id,
                return_number=return_number,
                return_date=datetime.now(IST),
                total_refund=total_refund,
                reason=return_in.reason,
                created_by=current_user.id,
                created_at=datetime.now(IST)
            )
            db.add(return_order)
            db.flush()

            # 6. Persist Return Items
            for item_data in return_items_to_add:
                ret_item = ReturnItem(
                    return_id=return_order.id,
                    sale_item_id=item_data["sale_item_id"],
                    product_id=item_data["product_id"],
                    batch_id=item_data["batch_id"],
                    quantity=item_data["quantity"],
                    refund_amount=item_data["refund_amount"],
                    restock_inventory=item_data["restock_inventory"],
                )
                db.add(ret_item)
            db.flush()

            # 7. Update Sale Status
            # Check if all items in the sale have been completely returned
            total_sale_qty = db.query(func.sum(SaleItem.quantity)).filter(
                SaleItem.sale_id == sale.id
            ).scalar() or Decimal("0.00")
            
            all_returned_qty = db.query(func.coalesce(func.sum(ReturnItem.quantity), Decimal("0.00"))).join(
                Return, Return.id == ReturnItem.return_id
            ).filter(
                Return.sale_id == sale.id
            ).scalar() or Decimal("0.00")

            if Decimal(str(all_returned_qty)) >= Decimal(str(total_sale_qty)):
                sale.status = "REFUNDED"
            else:
                sale.status = "PARTIALLY_REFUNDED"

            # 8. Audit Log
            from app.services.audit_service import AuditService
            AuditService.log(
                db=db,
                action="SALE_RETURNED",
                user_id=current_user.id,
                branch_id=branch_id,
                entity_type="return",
                entity_id=return_order.id,
                new_value={"return_number": return_number, "sale_invoice": sale.invoice_number, "total_refund": str(total_refund), "sale_status": sale.status}
            )

            db.commit()
            db.refresh(return_order)
            return return_order

        except (ValueError, HTTPException) as ve:
            db.rollback()
            if isinstance(ve, HTTPException):
                raise ve
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
        except Exception as e:
            db.rollback()
            logger.exception("Return transaction failed unexpectedly")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Return transaction failed due to an internal error. Please try again or contact support."
            )

import pytest
from datetime import date, timedelta
from decimal import Decimal
import app.models  # noqa
from app.database.database import SessionLocal
from app.models.product import Product
from app.models.inventory import InventoryBatch, InventoryTransaction
from app.models.sale import Sale
from app.models.user import User, RoleEnum
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.services.sales_service import SalesService

class TestFEFOAndSales:
    def test_fefo_allocation_and_atomic_deduction(self):
        db = SessionLocal()
        try:
            # 1. Create a dummy test user for branch 1
            test_user = db.query(User).filter(User.email == "test_staff_b1@medx.com").first()
            if not test_user:
                test_user = User(
                    email="test_staff_b1@medx.com",
                    hashed_password="hashed_pw_placeholder",
                    full_name="Test Staff B1",
                    role=RoleEnum.STAFF,
                    branch_id=1,
                    is_active=True
                )
                db.add(test_user)
                db.commit()
                db.refresh(test_user)

            # 2. Create test product
            import time
            sku_code = f"FEFO-TEST-{int(time.time())}"
            test_prod = Product(
                name="FEFO Test Syrup 100ml",
                brand="Test Pharma",
                sku=sku_code,
                mrp=Decimal("150.00"),
                selling_price=Decimal("130.00"),
                gst_percentage=Decimal("12.00"),
                is_active=True
            )
            db.add(test_prod)
            db.commit()
            db.refresh(test_prod)

            today = date.today()
            # Batch 1: Expiring in 10 days (Stock: 5) -> Should be consumed FIRST
            b1 = InventoryBatch(
                product_id=test_prod.id,
                batch_number="BATCH-EXP-10D",
                expiry_date=today + timedelta(days=10),
                quantity_available=5,
                purchase_price=Decimal("90.00"),
                mrp=Decimal("150.00"),
                selling_price=Decimal("130.00"),
                branch_id=1,
                is_placeholder_expiry=False
            )
            # Batch 2: Expiring in 60 days (Stock: 10) -> Should be consumed SECOND (3 units)
            b2 = InventoryBatch(
                product_id=test_prod.id,
                batch_number="BATCH-EXP-60D",
                expiry_date=today + timedelta(days=60),
                quantity_available=10,
                purchase_price=Decimal("90.00"),
                mrp=Decimal("150.00"),
                selling_price=Decimal("130.00"),
                branch_id=1,
                is_placeholder_expiry=False
            )
            # Batch 3: Already Expired (Stock: 20) -> Must NEVER be consumed
            b3 = InventoryBatch(
                product_id=test_prod.id,
                batch_number="BATCH-EXPIRED",
                expiry_date=today - timedelta(days=5),
                quantity_available=20,
                purchase_price=Decimal("90.00"),
                mrp=Decimal("150.00"),
                selling_price=Decimal("130.00"),
                branch_id=1,
                is_placeholder_expiry=False
            )
            # Batch 4: Placeholder Expiry (Stock: 50) -> Must NEVER participate in normal FEFO
            b4 = InventoryBatch(
                product_id=test_prod.id,
                batch_number="BATCH-PLACEHOLDER",
                expiry_date=date(9999, 12, 31),
                quantity_available=50,
                purchase_price=Decimal("90.00"),
                mrp=Decimal("150.00"),
                selling_price=Decimal("130.00"),
                branch_id=1,
                is_placeholder_expiry=True
            )
            db.add_all([b1, b2, b3, b4])
            db.commit()

            # 3. Request 8 units (without specifying batch_id) -> System must allocate 5 from B1, 3 from B2
            sale_req = SaleCreate(
                items=[SaleItemCreate(product_id=test_prod.id, quantity=8)]
            )

            sale = SalesService.create_sale(db, sale_req, test_user)

            # Assertions
            assert sale.id is not None
            assert sale.branch_id == 1
            assert sale.status == "COMPLETED"
            assert "/" in sale.invoice_number

            # Verify stock deduction
            db.refresh(b1)
            db.refresh(b2)
            db.refresh(b3)
            db.refresh(b4)

            assert b1.quantity_available == 0   # 5 - 5 = 0
            assert b2.quantity_available == 7   # 10 - 3 = 7
            assert b3.quantity_available == 20  # untouched
            assert b4.quantity_available == 50  # untouched

            # Verify Sale Items count
            assert len(sale.items) == 2
            item_quantities = sorted([item.quantity for item in sale.items])
            assert item_quantities == [3, 5]

            # 8 * 130.00 = 1040.00
            # GST 12% = 124.80
            # Unrounded = 1164.80
            # Nearest integer round-off = +0.20
            # Grand Total = 1165.00
            assert sale.total_amount == Decimal("1040.00")
            assert sale.tax_amount == Decimal("124.80")
            assert sale.round_off == Decimal("0.20")
            assert sale.grand_total == Decimal("1165.00")

            # Verify Inventory Transactions were created
            txns = db.query(InventoryTransaction).filter(
                InventoryTransaction.reference_type == "Sale",
                InventoryTransaction.reference_id == str(sale.id)
            ).all()
            assert len(txns) == 2
            txn_changes = sorted([t.quantity_change for t in txns])
            assert txn_changes == [-5, -3]

            # Verify Payments created
            assert len(sale.payments) == 1
            assert sale.payments[0].amount == Decimal("1165.00")

        finally:
            try:
                from app.models.sale import Sale, SaleItem
                from app.models.payment import Payment
                from app.models.audit_log import AuditLog
                sales = db.query(Sale).filter(Sale.created_by == test_user.id).all()
                s_ids = [s.id for s in sales]
                if s_ids:
                    db.query(Payment).filter(Payment.sale_id.in_(s_ids)).delete(synchronize_session=False)
                    db.query(SaleItem).filter(SaleItem.sale_id.in_(s_ids)).delete(synchronize_session=False)
                    db.query(Sale).filter(Sale.id.in_(s_ids)).delete(synchronize_session=False)
                db.query(InventoryTransaction).filter(InventoryTransaction.product_id == test_prod.id).delete(synchronize_session=False)
                db.query(AuditLog).filter(AuditLog.user_id == test_user.id).delete(synchronize_session=False)
                db.query(InventoryBatch).filter(InventoryBatch.product_id == test_prod.id).delete(synchronize_session=False)
                db.query(Product).filter(Product.id == test_prod.id).delete(synchronize_session=False)
                db.query(User).filter(User.id == test_user.id).delete(synchronize_session=False)
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()

    def test_fractional_quantity_sale_for_loose_tablets(self):
        """
        Verify that fractional quantities (e.g. 0.5 packs for 5 loose tablets out of 10)
        are accepted by schema validation, processed accurately by SalesService, and deducted from inventory.
        """
        db = SessionLocal()
        try:
            import time
            test_user = db.query(User).filter(User.email == "test_staff_b1@medx.com").first()
            if not test_user:
                test_user = User(
                    email="test_staff_b1@medx.com",
                    hashed_password="hash",
                    full_name="Staff",
                    role=RoleEnum.STAFF,
                    branch_id=1,
                    is_active=True
                )
                db.add(test_user)
                db.commit()
                db.refresh(test_user)
            
            test_prod = Product(
                name="Test Paracetamol 500mg Strip",
                brand="Test Pharma",
                sku=f"TAB-LOOSE-{int(time.time())}",
                mrp=Decimal("50.00"),
                selling_price=Decimal("40.00"),
                gst_percentage=Decimal("12.00"),
                is_active=True
            )
            db.add(test_prod)
            db.commit()
            db.refresh(test_prod)

            today = date.today()
            batch = InventoryBatch(
                product_id=test_prod.id,
                batch_number="BATCH-LOOSE-TEST",
                expiry_date=today + timedelta(days=180),
                quantity_available=10.0,
                purchase_price=Decimal("25.00"),
                mrp=Decimal("50.00"),
                selling_price=Decimal("40.00"),
                branch_id=1,
                is_placeholder_expiry=False
            )
            db.add(batch)
            db.commit()
            db.refresh(batch)

            # Customer buys 0.5 packs (5 tablets out of 10)
            sale_in = SaleCreate(
                items=[
                    SaleItemCreate(
                        product_id=test_prod.id,
                        batch_id=batch.id,
                        quantity=Decimal("0.5")
                    )
                ],
                branch_id=1,
                payment_method="CASH"
            )

            sale = SalesService.create_sale(db, sale_in, test_user)

            # Subtotal: 0.5 * 40.00 = 20.00
            # GST: 12% of 20.00 = 2.40
            # Grand Total: 22.40 -> Round off +0.60 -> 23.00 (ROUND_HALF_UP) or 22.40 unrounded
            assert sale.total_amount == Decimal("20.00")
            assert sale.tax_amount == Decimal("2.40")
            assert sale.grand_total == Decimal("22.00") # 22.40 rounds to 22.00

            db.refresh(batch)
            # 10.0 - 0.5 = 9.5 available
            assert float(batch.quantity_available) == 9.5

            assert len(sale.items) == 1
            assert Decimal(str(sale.items[0].quantity)) == Decimal("0.5")

        finally:
            try:
                from app.models.sale import Sale, SaleItem
                from app.models.payment import Payment
                from app.models.audit_log import AuditLog
                sales = db.query(Sale).filter(Sale.created_by == test_user.id).all()
                s_ids = [s.id for s in sales]
                if s_ids:
                    db.query(Payment).filter(Payment.sale_id.in_(s_ids)).delete(synchronize_session=False)
                    db.query(SaleItem).filter(SaleItem.sale_id.in_(s_ids)).delete(synchronize_session=False)
                    db.query(Sale).filter(Sale.id.in_(s_ids)).delete(synchronize_session=False)
                db.query(InventoryTransaction).filter(InventoryTransaction.product_id == test_prod.id).delete(synchronize_session=False)
                db.query(AuditLog).filter(AuditLog.user_id == test_user.id).delete(synchronize_session=False)
                db.query(InventoryBatch).filter(InventoryBatch.id == batch.id).delete(synchronize_session=False)
                db.query(Product).filter(Product.id == test_prod.id).delete(synchronize_session=False)
                db.query(User).filter(User.id == test_user.id).delete(synchronize_session=False)
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()


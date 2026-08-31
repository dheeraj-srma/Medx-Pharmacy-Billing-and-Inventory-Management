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
            db.close()

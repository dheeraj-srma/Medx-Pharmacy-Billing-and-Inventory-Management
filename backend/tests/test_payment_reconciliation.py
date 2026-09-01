import pytest
import time
from decimal import Decimal
from datetime import date, timedelta
from app.database.database import SessionLocal
from app.models.user import User, RoleEnum
from app.models.product import Product
from app.models.inventory import InventoryBatch
from app.models.payment import PaymentMethodEnum
from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate
from app.services.sales_service import SalesService
from fastapi import HTTPException

class TestPaymentReconciliation:
    @pytest.fixture(autouse=True)
    def setup_method(self):
        self.db = SessionLocal()
        # Ensure test user
        self.user = self.db.query(User).filter(User.email == "test_staff_b1@medx.com").first()
        if not self.user:
            self.user = User(
                email="test_staff_b1@medx.com",
                hashed_password="hash",
                full_name="Staff",
                role=RoleEnum.STAFF,
                branch_id=1,
                is_active=True
            )
            self.db.add(self.user)
            self.db.commit()
            self.db.refresh(self.user)

        # Create test product with stock
        self.prod = Product(
            name=f"Reconciliation Test Prod {int(time.time())}",
            sku=f"RECON-{int(time.time())}",
            mrp=Decimal("100.00"),
            selling_price=Decimal("100.00"),
            gst_percentage=Decimal("0.00"),
            is_active=True
        )
        self.db.add(self.prod)
        self.db.commit()
        self.db.refresh(self.prod)

        self.batch = InventoryBatch(
            product_id=self.prod.id,
            batch_number="BATCH-RECON-1",
            expiry_date=date.today() + timedelta(days=90),
            quantity_available=Decimal("10.0000"),
            purchase_price=Decimal("50.00"),
            mrp=Decimal("100.00"),
            selling_price=Decimal("100.00"),
            branch_id=1
        )
        self.db.add(self.batch)
        self.db.commit()

        yield
        # Teardown: Clean up test sales, payments, batch, product, and user
        try:
            from app.models.sale import Sale, SaleItem
            from app.models.payment import Payment
            from app.models.inventory import InventoryTransaction
            from app.models.audit_log import AuditLog
            sales = self.db.query(Sale).filter(Sale.created_by == self.user.id).all()
            sale_ids = [s.id for s in sales]
            if sale_ids:
                self.db.query(Payment).filter(Payment.sale_id.in_(sale_ids)).delete(synchronize_session=False)
                self.db.query(SaleItem).filter(SaleItem.sale_id.in_(sale_ids)).delete(synchronize_session=False)
                self.db.query(Sale).filter(Sale.id.in_(sale_ids)).delete(synchronize_session=False)
            self.db.query(InventoryTransaction).filter(InventoryTransaction.product_id == self.prod.id).delete(synchronize_session=False)
            self.db.query(AuditLog).filter(AuditLog.user_id == self.user.id).delete(synchronize_session=False)
            self.db.query(InventoryBatch).filter(InventoryBatch.id == self.batch.id).delete(synchronize_session=False)
            self.db.query(Product).filter(Product.id == self.prod.id).delete(synchronize_session=False)
            self.db.query(User).filter(User.id == self.user.id).delete(synchronize_session=False)
            self.db.commit()
        except Exception:
            self.db.rollback()
        finally:
            self.db.close()

    def test_mismatched_payment_amount_is_rejected(self):
        # 2 units * 100 = 200 total, but customer pays only 150
        sale_req = SaleCreate(
            items=[SaleItemCreate(product_id=self.prod.id, quantity=Decimal("2"))],
            payments=[PaymentCreate(method=PaymentMethodEnum.CASH, amount=Decimal("150.00"))]
        )
        with pytest.raises(HTTPException) as exc_info:
            SalesService.create_sale(self.db, sale_req, self.user)
        assert exc_info.value.status_code == 400
        assert "does not reconcile" in exc_info.value.detail.lower()

    def test_zero_payment_amount_is_rejected(self):
        sale_req = SaleCreate(
            items=[SaleItemCreate(product_id=self.prod.id, quantity=Decimal("1"))],
            payments=[PaymentCreate(method=PaymentMethodEnum.CASH, amount=Decimal("0.00"))]
        )
        with pytest.raises(HTTPException) as exc_info:
            SalesService.create_sale(self.db, sale_req, self.user)
        assert exc_info.value.status_code == 400
        assert "greater than zero" in exc_info.value.detail.lower()

    def test_split_payment_matching_grand_total_succeeds(self):
        # 2 units * 100 = 200 total: Split ₹120 UPI + ₹80 CASH
        sale_req = SaleCreate(
            items=[SaleItemCreate(product_id=self.prod.id, quantity=Decimal("2"))],
            payments=[
                PaymentCreate(method=PaymentMethodEnum.UPI, amount=Decimal("120.00")),
                PaymentCreate(method=PaymentMethodEnum.CASH, amount=Decimal("80.00"))
            ]
        )
        sale = SalesService.create_sale(self.db, sale_req, self.user)
        assert sale.id is not None
        assert sale.grand_total == Decimal("200.00")
        assert len(sale.payments) == 2
        assert sum(p.amount for p in sale.payments) == Decimal("200.00")

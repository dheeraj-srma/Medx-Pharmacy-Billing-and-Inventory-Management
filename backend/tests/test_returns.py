import pytest
import time
from decimal import Decimal
from datetime import date, timedelta
from app.database.database import SessionLocal
from app.models.user import User, RoleEnum
from app.models.product import Product
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.sale import Sale
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.schemas.returns import ReturnCreate, ReturnItemCreate
from app.services.sales_service import SalesService
from app.services.returns_service import ReturnsService
from fastapi import HTTPException

class TestReturnsModule:
    @pytest.fixture(autouse=True)
    def setup_method(self):
        self.db = SessionLocal()
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

        self.prod = Product(
            name=f"Return Test Med {int(time.time())}",
            sku=f"RET-MED-{int(time.time())}",
            mrp=Decimal("200.00"),
            selling_price=Decimal("180.00"),
            gst_percentage=Decimal("0.00"),
            is_active=True
        )
        self.db.add(self.prod)
        self.db.commit()
        self.db.refresh(self.prod)

        self.batch = InventoryBatch(
            product_id=self.prod.id,
            batch_number="BATCH-RET-01",
            expiry_date=date.today() + timedelta(days=120),
            quantity_available=Decimal("10.0000"),
            purchase_price=Decimal("100.00"),
            mrp=Decimal("200.00"),
            selling_price=Decimal("180.00"),
            branch_id=1
        )
        self.db.add(self.batch)
        self.db.commit()
        self.db.refresh(self.batch)

        # Create a sale of 4 units
        sale_req = SaleCreate(
            items=[SaleItemCreate(product_id=self.prod.id, quantity=Decimal("4"))]
        )
        self.sale = SalesService.create_sale(self.db, sale_req, self.user)

        yield
        self.db.close()

    def test_partial_return_restores_stock_and_creates_transaction(self):
        sale_item = self.sale.items[0]
        # Return 2 units out of 4
        ret_req = ReturnCreate(
            sale_id=self.sale.id,
            reason="Customer bought too many",
            items=[ReturnItemCreate(sale_item_id=sale_item.id, quantity=Decimal("2"), restock_inventory=True)]
        )

        return_order = ReturnsService.process_return(self.db, ret_req, self.user)
        assert return_order.id is not None
        assert return_order.total_refund == Decimal("360.00") # 2 * 180 = 360
        assert return_order.return_number.startswith("RET-")

        # Inventory check: 10 - 4 + 2 = 8
        self.db.refresh(self.batch)
        assert self.batch.quantity_available == Decimal("8.0000")

        # Sale status check
        self.db.refresh(self.sale)
        assert self.sale.status == "PARTIALLY_REFUNDED"

        # Inventory transaction check
        txn = self.db.query(InventoryTransaction).filter(
            InventoryTransaction.transaction_type == TransactionTypeEnum.RETURN,
            InventoryTransaction.product_id == self.prod.id
        ).order_by(InventoryTransaction.id.desc()).first()
        assert txn is not None
        assert txn.quantity_change == Decimal("2.0000")

    def test_returning_more_than_sold_is_rejected(self):
        sale_item = self.sale.items[0]
        # Attempt to return 5 units when only 4 were sold
        ret_req = ReturnCreate(
            sale_id=self.sale.id,
            items=[ReturnItemCreate(sale_item_id=sale_item.id, quantity=Decimal("5"))]
        )
        with pytest.raises(HTTPException) as exc_info:
            ReturnsService.process_return(self.db, ret_req, self.user)
        assert exc_info.value.status_code == 400
        assert "max returnable" in exc_info.value.detail.lower()

    def test_full_return_updates_sale_status_to_refunded(self):
        sale_item = self.sale.items[0]
        # Return all 4 units
        ret_req = ReturnCreate(
            sale_id=self.sale.id,
            items=[ReturnItemCreate(sale_item_id=sale_item.id, quantity=Decimal("4"))]
        )
        return_order = ReturnsService.process_return(self.db, ret_req, self.user)
        assert return_order.total_refund == Decimal("720.00") # 4 * 180

        self.db.refresh(self.sale)
        assert self.sale.status == "REFUNDED"

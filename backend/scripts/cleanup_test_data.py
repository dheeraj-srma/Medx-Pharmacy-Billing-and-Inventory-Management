"""
cleanup_test_data.py

Removes test-generated artifact records inserted during test suite execution
against the primary database:
- Sales, SaleItems, Payments created by test user (test_staff_b1@medx.com)
- Returns and ReturnItems created by test user
- InventoryTransactions created by test user
- AuditLogs created by test user
- Ephemeral test products and batches (FEFO Test, Reconciliation Test, Return Test)
- Test user itself (test_staff_b1@medx.com)
"""
import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.database import SessionLocal
from app.models.user import User
from app.models.sale import Sale, SaleItem
from app.models.payment import Payment
from app.models.returns import Return, ReturnItem
from app.models.inventory import InventoryBatch, InventoryTransaction
from app.models.product import Product
from app.models.audit_log import AuditLog
from app.models.data_integrity import DataIntegrityIssue

def cleanup():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "test_staff_b1@medx.com").first()
        uid = user.id if user else None

        print(f"Target test user: {user.email if user else 'None'} (id={uid})")

        # 1. Identify test products
        test_prods = db.query(Product).filter(
            (Product.name.like("FEFO%")) |
            (Product.name.like("Test Paracetamol%")) |
            (Product.name.like("Reconciliation%")) |
            (Product.name.like("Return Test%")) |
            (Product.sku.like("FEFO-%")) |
            (Product.sku.like("TAB-LOOSE-%")) |
            (Product.sku.like("RECON-%")) |
            (Product.sku.like("RET-MED-%"))
        ).all()
        test_prod_ids = [p.id for p in test_prods]
        print(f"Found {len(test_prods)} test products to clean up.")

        # 2. Identify test batches
        test_batches = db.query(InventoryBatch).filter(
            InventoryBatch.product_id.in_(test_prod_ids)
        ).all() if test_prod_ids else []
        test_batch_ids = [b.id for b in test_batches]
        print(f"Found {len(test_batches)} test batches to clean up.")

        # 3. Clean up returns and return items referencing test sales or test batches
        test_returns = db.query(Return).filter(
            (Return.created_by == uid) | (Return.return_number.like("RET-%"))
        ).all()
        test_return_ids = [r.id for r in test_returns]
        
        # Delete all return items referencing test batches or test returns
        db.query(ReturnItem).filter(
            (ReturnItem.return_id.in_(test_return_ids)) |
            (ReturnItem.batch_id.in_(test_batch_ids)) |
            (ReturnItem.product_id.in_(test_prod_ids))
        ).delete(synchronize_session=False)

        if test_return_ids:
            num_returns = db.query(Return).filter(Return.id.in_(test_return_ids)).delete(synchronize_session=False)
            print(f"Deleted {num_returns} test returns.")

        # 4. Clean up test sales, sale items, and payments
        test_sale_ids = []
        if uid:
            test_sales = db.query(Sale).filter(Sale.created_by == uid).all()
            test_sale_ids = [s.id for s in test_sales]

        # Also find any sales referencing test batches
        orphan_sales_with_test_batches = db.query(SaleItem.sale_id).filter(
            (SaleItem.batch_id.in_(test_batch_ids)) |
            (SaleItem.product_id.in_(test_prod_ids))
        ).distinct().all() if (test_batch_ids or test_prod_ids) else []
        orphan_sale_ids = [s[0] for s in orphan_sales_with_test_batches]

        all_target_sale_ids = list(set(test_sale_ids + orphan_sale_ids))
        print(f"Total test sales to clean up: {len(all_target_sale_ids)}")

        if all_target_sale_ids:
            num_payments = db.query(Payment).filter(Payment.sale_id.in_(all_target_sale_ids)).delete(synchronize_session=False)
            num_sale_items = db.query(SaleItem).filter(
                (SaleItem.sale_id.in_(all_target_sale_ids)) |
                (SaleItem.batch_id.in_(test_batch_ids)) |
                (SaleItem.product_id.in_(test_prod_ids))
            ).delete(synchronize_session=False)
            num_sales = db.query(Sale).filter(Sale.id.in_(all_target_sale_ids)).delete(synchronize_session=False)
            print(f"Deleted {num_sales} test sales, {num_sale_items} sale items, and {num_payments} payments.")

        # 5. Clean up inventory transactions
        if uid or test_prod_ids or test_batch_ids:
            txn_filter = []
            if uid:
                txn_filter.append(InventoryTransaction.user_id == uid)
            if test_prod_ids:
                txn_filter.append(InventoryTransaction.product_id.in_(test_prod_ids))
            if test_batch_ids:
                txn_filter.append(InventoryTransaction.batch_id.in_(test_batch_ids))
            
            from sqlalchemy import or_
            num_txns = db.query(InventoryTransaction).filter(or_(*txn_filter)).delete(synchronize_session=False)
            print(f"Deleted {num_txns} test inventory transactions.")

        # 6. Clean up audit logs
        if uid:
            num_audits = db.query(AuditLog).filter(AuditLog.user_id == uid).delete(synchronize_session=False)
            print(f"Deleted {num_audits} test audit logs.")

        # 7. Clean up test batches and products
        if test_batch_ids:
            num_b = db.query(InventoryBatch).filter(InventoryBatch.id.in_(test_batch_ids)).delete(synchronize_session=False)
            print(f"Deleted {num_b} test batches.")

        if test_prod_ids:
            num_p = db.query(Product).filter(Product.id.in_(test_prod_ids)).delete(synchronize_session=False)
            print(f"Deleted {num_p} test products.")

        # 8. Clean up mock data integrity issues
        num_issues = db.query(DataIntegrityIssue).filter(
            DataIntegrityIssue.entity_id.in_([99999, 88888])
        ).delete(synchronize_session=False)
        print(f"Deleted {num_issues} test data integrity issues.")

        # 9. Clean up test user
        if user:
            db.delete(user)
            print(f"Deleted test user {user.email}.")

        db.commit()
        print("Successfully cleaned up all test artifacts from database!")

    except Exception as e:
        db.rollback()
        print(f"Cleanup failed with error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    cleanup()

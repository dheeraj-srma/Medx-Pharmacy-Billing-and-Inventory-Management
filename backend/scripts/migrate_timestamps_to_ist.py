"""
migrate_timestamps_to_ist.py

Migrates historical records stored with UTC timestamps (+00:00) into IST (+05:30)
so that existing sales, transactions, invoices, and reports match real Indian Standard Time.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.database import SessionLocal, engine
from sqlalchemy import text
from app.core.config import settings

def migrate_timestamps():
    if "sqlite" in settings.SQLALCHEMY_DATABASE_URI:
        print("SQLite database detected; skipping PostgreSQL interval migration.")
        return

    db = SessionLocal()
    try:
        # Check an existing sale to determine if migration is needed
        # Invoices with format INV-YYYYMMDDHHMMSS can tell us if created_at matches
        res = db.execute(text("""
            SELECT invoice_number, created_at
            FROM sales
            WHERE invoice_number LIKE 'INV-%'
            ORDER BY id ASC
            LIMIT 1
        """)).first()

        if res:
            inv_num, created_at = res
            # e.g. INV-20260827140538 -> 14:05:38
            # If created_at is 08:35:38, it is 5.5 hours behind
            print(f"Sample historical invoice: {inv_num}, created_at: {created_at}")
            
        print("Adjusting historical UTC timestamps by +5 hours 30 minutes to match true IST...")
        
        db.execute(text("UPDATE sales SET sale_date = sale_date + INTERVAL '5 hours 30 minutes', created_at = created_at + INTERVAL '5 hours 30 minutes';"))
        db.execute(text("UPDATE payments SET created_at = created_at + INTERVAL '5 hours 30 minutes';"))
        db.execute(text("UPDATE inventory_transactions SET timestamp = timestamp + INTERVAL '5 hours 30 minutes';"))
        db.execute(text("UPDATE returns SET return_date = return_date + INTERVAL '5 hours 30 minutes', created_at = created_at + INTERVAL '5 hours 30 minutes';"))
        db.execute(text("UPDATE purchases SET created_at = created_at + INTERVAL '5 hours 30 minutes';"))
        db.execute(text("UPDATE customers SET created_at = created_at + INTERVAL '5 hours 30 minutes';"))
        db.execute(text("UPDATE audit_logs SET timestamp = timestamp + INTERVAL '5 hours 30 minutes';"))
        
        db.commit()
        print("Successfully migrated historical records to IST!")

        # Verify latest sale
        latest = db.execute(text("SELECT id, invoice_number, created_at, sale_date FROM sales ORDER BY id DESC LIMIT 1")).first()
        print("Updated latest sale:", latest)

    except Exception as e:
        db.rollback()
        print("Migration failed:", e)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    migrate_timestamps()

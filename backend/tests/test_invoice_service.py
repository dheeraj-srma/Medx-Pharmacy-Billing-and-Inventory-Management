import pytest
from datetime import datetime
import app.models  # noqa
from app.services.invoice_service import get_indian_financial_year, generate_sequential_invoice_number
from app.database.database import SessionLocal
from app.models.branch import Branch
from app.models.invoice_sequence import InvoiceSequence

class TestInvoiceService:
    def test_indian_financial_year_calculation(self):
        # April 2026 -> FY 2026-27 (26-27)
        dt_apr = datetime(2026, 4, 1, 10, 0, 0)
        full, short = get_indian_financial_year(dt_apr)
        assert full == "2026-27"
        assert short == "26-27"

        # August 2026 -> FY 2026-27 (26-27)
        dt_aug = datetime(2026, 8, 31, 15, 0, 0)
        full, short = get_indian_financial_year(dt_aug)
        assert full == "2026-27"
        assert short == "26-27"

        # March 2027 -> FY 2026-27 (26-27)
        dt_mar = datetime(2027, 3, 31, 23, 59, 59)
        full, short = get_indian_financial_year(dt_mar)
        assert full == "2026-27"
        assert short == "26-27"

        # April 2027 -> FY 2027-28 (27-28)
        dt_next_apr = datetime(2027, 4, 1, 0, 0, 0)
        full, short = get_indian_financial_year(dt_next_apr)
        assert full == "2027-28"
        assert short == "27-28"

        # January 2026 -> FY 2025-26 (25-26)
        dt_jan = datetime(2026, 1, 15, 12, 0, 0)
        full, short = get_indian_financial_year(dt_jan)
        assert full == "2025-26"
        assert short == "25-26"

    def test_sequential_invoice_number_generation(self):
        db = SessionLocal()
        try:
            # Ensure branch 1 exists
            branch = db.query(Branch).filter(Branch.id == 1).first()
            branch_code = branch.code if branch else "JPR01"

            now = datetime(2026, 8, 31, 12, 0, 0)
            inv1 = generate_sequential_invoice_number(db, branch_id=1, branch_code=branch_code, dt=now)
            inv2 = generate_sequential_invoice_number(db, branch_id=1, branch_code=branch_code, dt=now)
            db.commit()

            assert inv1.startswith(f"{branch_code}/26-27/")
            assert inv2.startswith(f"{branch_code}/26-27/")

            num1 = int(inv1.split("/")[-1])
            num2 = int(inv2.split("/")[-1])
            assert num2 == num1 + 1
        finally:
            db.close()

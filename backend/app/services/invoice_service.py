from datetime import datetime, date
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from app.core.timezone import IST
from app.models.invoice_sequence import InvoiceSequence
from app.models.branch import Branch

def get_indian_financial_year(dt: Optional[datetime] = None) -> Tuple[str, str]:
    """
    Computes Indian Financial Year (April 1 to March 31).
    Returns (full_fy, short_fy):
        e.g. on 2026-08-31 -> ("2026-27", "26-27")
        e.g. on 2027-02-15 -> ("2026-27", "26-27")
    """
    target = dt if dt is not None else datetime.now(IST)
    year = target.year
    month = target.month

    if month >= 4:
        start_year = year
        end_year = year + 1
    else:
        start_year = year - 1
        end_year = year

    start_short = str(start_year)[-2:]
    end_short = str(end_year)[-2:]
    
    full_fy = f"{start_year}-{end_short}"  # "2026-27"
    short_fy = f"{start_short}-{end_short}" # "26-27"
    return full_fy, short_fy


def generate_sequential_invoice_number(
    db: Session,
    branch_id: int,
    branch_code: Optional[str] = None,
    dt: Optional[datetime] = None
) -> str:
    """
    Atomically generates a branch-scoped sequential invoice number using database row locking.
    Example output: JPR01/26-27/000001
    """
    now = dt if dt is not None else datetime.now(IST)
    full_fy, short_fy = get_indian_financial_year(now)

    if not branch_code:
        branch = db.query(Branch).filter(Branch.id == branch_id).first()
        branch_code = branch.code if branch else f"BR{branch_id:02d}"

    # Lock sequence record to prevent race conditions during concurrent checkouts
    seq_record = db.query(InvoiceSequence).filter(
        InvoiceSequence.branch_id == branch_id,
        InvoiceSequence.financial_year == full_fy
    ).with_for_update().first()

    if not seq_record:
        seq_record = InvoiceSequence(
            branch_id=branch_id,
            financial_year=full_fy,
            last_number=0,
            updated_at=now
        )
        db.add(seq_record)
        db.flush()

    seq_record.last_number += 1
    seq_record.updated_at = now

    invoice_number = f"{branch_code}/{short_fy}/{seq_record.last_number:06d}"
    return invoice_number

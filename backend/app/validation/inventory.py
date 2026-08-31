"""
Inventory-specific validation pipeline.

Key rules:
- quantity MUST be > 0 (ERROR if negative or zero for initial stock)
- expiry_date must be a valid date format (ERROR if invalid)
- manufacturing_date < expiry_date (ERROR if not)
- batch_number is MISSING → fallback placeholder generated
- expiry_date is MISSING → fallback placeholder generated (far future date)

IMPORTANT: batch_number and expiry_date placeholders must NEVER participate
in FEFO logic or business calculations. The data integrity layer tracks them.
"""
from typing import Any, Optional
from datetime import date

from app.services.validation_service import ValidationResult, FieldIssue, Severity, IssueType
from app.services import fallback_service
from app.validation.common import validate_date_ordering, normalize_string


def validate_inventory_batch(
    quantity: Any,
    expiry_date: Any,
    batch_number: Any = None,
    manufacturing_date: Any = None,
    purchase_price: Any = None,
    mrp: Any = None,
    selling_price: Any = None,
) -> ValidationResult:
    """
    Validate an inventory batch submission.

    Returns ValidationResult with:
    - ERROR issues → caller MUST reject the request
    - MISSING issues → caller generates placeholders and logs issues
    - WARNING issues → caller logs issues but allows workflow to proceed
    """
    result = ValidationResult()

    # --- quantity ---
    if quantity is None:
        result.add_issue(FieldIssue(
            field_name="quantity",
            severity=Severity.ERROR,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message="Quantity is required.",
            original_value=None,
        ))
    else:
        try:
            q = float(quantity)
        except (TypeError, ValueError):
            result.add_issue(FieldIssue(
                field_name="quantity",
                severity=Severity.ERROR,
                issue_type=IssueType.INVALID_FORMAT,
                message="Quantity must be a number.",
                original_value=quantity,
            ))
            q = None

        if q is not None and q < 0:
            result.add_issue(FieldIssue(
                field_name="quantity",
                severity=Severity.ERROR,
                issue_type=IssueType.INVALID_VALUE,
                message="Quantity cannot be negative.",
                original_value=quantity,
            ))
        elif q is not None and q == 0:
            result.add_issue(FieldIssue(
                field_name="quantity",
                severity=Severity.WARNING,
                issue_type=IssueType.BUSINESS_RULE_WARNING,
                message="Quantity is zero — this batch will not appear in available stock.",
                original_value=quantity,
            ))

    # --- expiry_date ---
    parsed_expiry: Optional[date] = None
    if not expiry_date:
        # Missing expiry date — generate placeholder (far future)
        placeholder = fallback_service.expiry_date_placeholder()
        result.add_issue(FieldIssue(
            field_name="expiry_date",
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message="Expiry date is missing. A far-future placeholder has been assigned. Update before dispensing this batch.",
            original_value=None,
            placeholder_value=placeholder,
        ))
    else:
        try:
            parsed_expiry = expiry_date if isinstance(expiry_date, date) else date.fromisoformat(str(expiry_date))
        except (TypeError, ValueError):
            result.add_issue(FieldIssue(
                field_name="expiry_date",
                severity=Severity.ERROR,
                issue_type=IssueType.INVALID_FORMAT,
                message="Expiry date must be a valid date (YYYY-MM-DD). Cannot generate a fallback for an invalid date.",
                original_value=expiry_date,
            ))

    # --- manufacturing_date ---
    parsed_mfg: Optional[date] = None
    if manufacturing_date:
        try:
            parsed_mfg = manufacturing_date if isinstance(manufacturing_date, date) else date.fromisoformat(str(manufacturing_date))
        except (TypeError, ValueError):
            result.add_issue(FieldIssue(
                field_name="manufacturing_date",
                severity=Severity.ERROR,
                issue_type=IssueType.INVALID_FORMAT,
                message="Manufacturing date must be a valid date (YYYY-MM-DD).",
                original_value=manufacturing_date,
            ))

    # --- Date ordering ---
    if parsed_mfg and parsed_expiry:
        ordering_issue = validate_date_ordering(
            "manufacturing_date", "expiry_date", parsed_mfg, parsed_expiry
        )
        if ordering_issue:
            result.add_issue(ordering_issue)

    # --- batch_number (MISSING is allowed — generates placeholder) ---
    batch_str = normalize_string(batch_number)
    if not batch_str:
        placeholder = fallback_service.batch_number_placeholder()
        result.add_issue(FieldIssue(
            field_name="batch_number",
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message="Batch number was not provided. A placeholder has been assigned. Please update with the actual batch number from the packaging.",
            original_value=batch_number,
            placeholder_value=placeholder,
        ))

    # --- Purchase price / MRP / selling price (optional but warn if negative) ---
    for fname, fval in [
        ("purchase_price", purchase_price),
        ("mrp", mrp),
        ("selling_price", selling_price),
    ]:
        if fval is not None:
            try:
                if float(fval) < 0:
                    result.add_issue(FieldIssue(
                        field_name=fname,
                        severity=Severity.ERROR,
                        issue_type=IssueType.INVALID_VALUE,
                        message=f"{fname} cannot be negative.",
                        original_value=fval,
                    ))
            except (TypeError, ValueError):
                result.add_issue(FieldIssue(
                    field_name=fname,
                    severity=Severity.ERROR,
                    issue_type=IssueType.INVALID_FORMAT,
                    message=f"{fname} must be a number.",
                    original_value=fval,
                ))

    return result

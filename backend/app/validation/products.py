"""
Product-specific validation pipeline.

Returns a ValidationResult describing all issues found.
Normalizations are applied to the returned data; callers must use
result.get_normalized_values() to get the clean data for persistence.
"""
from typing import Any, Optional
from app.services.validation_service import ValidationResult, FieldIssue, Severity, IssueType
from app.validation.common import (
    validate_required_string,
    validate_optional_string,
    validate_non_negative_number,
    validate_non_negative_integer,
    validate_optional_gst,
    normalize_string,
)

# Maximum sane MRP/price (sanity upper bound)
MAX_PRICE = 1_000_000.0
MAX_GST_PERCENT = 28.0  # Highest GST slab in India


def validate_product(
    name: Any,
    mrp: Any,
    selling_price: Any,
    reorder_level: Any = 10,
    gst_percentage: Any = 0.0,
    generic_name: Any = None,
    brand: Any = None,
    manufacturer: Any = None,
    pack_size: Any = None,
    barcode: Any = None,
    sku: Any = None,
    hsn_code: Any = None,
    description: Any = None,
) -> ValidationResult:
    """
    Run the full product validation pipeline.

    Returns a ValidationResult. If result.is_valid is False, the operation
    must be rejected. If result.has_missing, missing fields get fallback
    placeholders and data issues are logged.
    """
    result = ValidationResult()

    # --- name (required) ---
    name_issue = validate_required_string("name", name, max_length=200)
    if name_issue:
        result.add_issue(name_issue)

    # --- mrp (required, non-negative) ---
    mrp_issue = validate_non_negative_number("mrp", mrp)
    if mrp_issue:
        result.add_issue(mrp_issue)
    elif float(mrp) > MAX_PRICE:
        result.add_issue(FieldIssue(
            field_name="mrp",
            severity=Severity.WARNING,
            issue_type=IssueType.BUSINESS_RULE_WARNING,
            message=f"MRP of {mrp} seems unusually high. Please verify.",
            original_value=mrp,
        ))

    # --- selling_price (required, non-negative) ---
    sp_issue = validate_non_negative_number("selling_price", selling_price)
    if sp_issue:
        result.add_issue(sp_issue)
    else:
        sp = float(selling_price)
        mrp_val = float(mrp) if mrp is not None else None

        if mrp_val is not None and sp > mrp_val:
            result.add_issue(FieldIssue(
                field_name="selling_price",
                severity=Severity.WARNING,
                issue_type=IssueType.BUSINESS_RULE_WARNING,
                message=f"Selling price (₹{sp}) exceeds MRP (₹{mrp_val}). Verify before saving.",
                original_value=selling_price,
            ))

    # --- reorder_level ---
    rl_issue = validate_non_negative_integer("reorder_level", reorder_level)
    if rl_issue:
        result.add_issue(rl_issue)

    # --- gst_percentage ---
    gst_issue = validate_non_negative_number("gst_percentage", gst_percentage)
    if gst_issue:
        result.add_issue(gst_issue)
    elif float(gst_percentage) > MAX_GST_PERCENT:
        result.add_issue(FieldIssue(
            field_name="gst_percentage",
            severity=Severity.WARNING,
            issue_type=IssueType.BUSINESS_RULE_WARNING,
            message=f"GST percentage {gst_percentage}% exceeds the maximum Indian GST slab of {MAX_GST_PERCENT}%.",
            original_value=gst_percentage,
        ))

    # --- Optional string fields ---
    for field_name, value, max_len in [
        ("generic_name", generic_name, 200),
        ("brand", brand, 100),
        ("manufacturer", manufacturer, 200),
        ("pack_size", pack_size, 100),
        ("barcode", barcode, 100),
        ("sku", sku, 100),
        ("hsn_code", hsn_code, 20),
        ("description", description, 2000),
    ]:
        issue = validate_optional_string(field_name, value, max_length=max_len)
        if issue:
            result.add_issue(issue)

    return result

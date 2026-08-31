"""
Common validators — reusable across all entity types.

Each validator returns a FieldIssue if a problem was found, or None if valid.
For normalizing validators, if normalization occurs the returned FieldIssue has
severity=NORMALIZED and normalized_value set.
"""
import re
from typing import Any, Optional
from datetime import date

from app.services.validation_service import FieldIssue, Severity, IssueType
from app.utils.phone import normalize_phone


# ---------------------------------------------------------------------------
# String validators
# ---------------------------------------------------------------------------

def normalize_string(value: Any) -> Optional[str]:
    """Strip and collapse internal whitespace. Returns None if empty after strip."""
    if value is None:
        return None
    s = str(value).strip()
    s = re.sub(r"\s+", " ", s)
    return s if s else None


def validate_required_string(
    field_name: str,
    value: Any,
    max_length: int = 500,
    min_length: int = 1,
) -> Optional[FieldIssue]:
    """
    Validate a required string field.
    Returns NORMALIZED if whitespace was stripped/collapsed.
    Returns MISSING if empty after normalization.
    Returns ERROR if too long.
    Returns None if valid.
    """
    raw = value
    normalized = normalize_string(value)

    if normalized is None:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message=f"{field_name} is required.",
            original_value=raw,
        )

    if len(normalized) > max_length:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_VALUE,
            message=f"{field_name} must not exceed {max_length} characters.",
            original_value=raw,
        )

    if str(raw) != normalized:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.NORMALIZED,
            issue_type=IssueType.NORMALIZED_VALUE,
            message=f"{field_name} was normalized (whitespace cleaned).",
            original_value=raw,
            normalized_value=normalized,
        )

    return None  # VALID


def validate_optional_string(
    field_name: str,
    value: Any,
    max_length: int = 500,
) -> Optional[FieldIssue]:
    """
    Validate an optional string field — only checks length and normalizes.
    Returns None (VALID) if value is empty/None.
    """
    if not value:
        return None
    normalized = normalize_string(value)
    if not normalized:
        return None
    if len(normalized) > max_length:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_VALUE,
            message=f"{field_name} must not exceed {max_length} characters.",
            original_value=value,
        )
    if str(value).strip() != normalized:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.NORMALIZED,
            issue_type=IssueType.NORMALIZED_VALUE,
            message=f"{field_name} was normalized (whitespace cleaned).",
            original_value=value,
            normalized_value=normalized,
        )
    return None


# ---------------------------------------------------------------------------
# Numeric validators
# ---------------------------------------------------------------------------

def validate_non_negative_number(
    field_name: str,
    value: Any,
) -> Optional[FieldIssue]:
    """Reject None or negative numbers. Returns ERROR if invalid."""
    if value is None:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message=f"{field_name} is required.",
            original_value=value,
        )
    try:
        num = float(value)
    except (TypeError, ValueError):
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_FORMAT,
            message=f"{field_name} must be a number.",
            original_value=value,
        )
    if num < 0:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_VALUE,
            message=f"{field_name} cannot be negative.",
            original_value=value,
        )
    return None


def validate_non_negative_integer(
    field_name: str,
    value: Any,
) -> Optional[FieldIssue]:
    """Validate that value is a non-negative integer."""
    if value is None:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message=f"{field_name} is required.",
            original_value=value,
        )
    try:
        num = int(value)
        if num != float(value):
            raise ValueError("not integer")
    except (TypeError, ValueError):
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_FORMAT,
            message=f"{field_name} must be a whole number.",
            original_value=value,
        )
    if num < 0:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_VALUE,
            message=f"{field_name} cannot be negative.",
            original_value=value,
        )
    return None


# ---------------------------------------------------------------------------
# Email validator
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def validate_optional_email(field_name: str, value: Any) -> Optional[FieldIssue]:
    """Validate and normalize optional email. Returns None if empty."""
    if not value:
        return None
    normalized = str(value).strip().lower()
    if not EMAIL_RE.match(normalized):
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_FORMAT,
            message=f"{field_name} is not a valid email address.",
            original_value=value,
        )
    if normalized != str(value).strip():
        return FieldIssue(
            field_name=field_name,
            severity=Severity.NORMALIZED,
            issue_type=IssueType.NORMALIZED_VALUE,
            message=f"{field_name} was normalized to lowercase.",
            original_value=value,
            normalized_value=normalized,
        )
    return None


# ---------------------------------------------------------------------------
# Phone validator
# ---------------------------------------------------------------------------

PHONE_RE = re.compile(r"^\+?[0-9\s\-().]{7,20}$")


def validate_optional_phone(field_name: str, value: Any) -> Optional[FieldIssue]:
    """Validate optional phone number format and return normalized 10-digit format."""
    if not value:
        return None
    stripped = str(value).strip()
    if not PHONE_RE.match(stripped):
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_FORMAT,
            message=f"{field_name} is not a valid phone number.",
            original_value=value,
        )
    raw, norm = normalize_phone(stripped)
    if norm and norm != stripped:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.NORMALIZED,
            issue_type=IssueType.NORMALIZED_VALUE,
            message=f"{field_name} was normalized.",
            original_value=value,
            normalized_value=norm,
        )
    return None


# ---------------------------------------------------------------------------
# GST Number validator
# ---------------------------------------------------------------------------

# India GSTIN: 15 chars alphanumeric
GST_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")


def validate_optional_gst(field_name: str, value: Any) -> Optional[FieldIssue]:
    """Validate optional GST number format (Indian GSTIN)."""
    if not value:
        return None
    normalized = str(value).strip().upper()
    if not GST_RE.match(normalized):
        return FieldIssue(
            field_name=field_name,
            severity=Severity.WARNING,
            issue_type=IssueType.INVALID_FORMAT,
            message=f"{field_name} does not appear to be a valid GSTIN.",
            original_value=value,
        )
    return None


# ---------------------------------------------------------------------------
# Date validators
# ---------------------------------------------------------------------------

def validate_date_not_in_past(
    field_name: str,
    value: Any,
    allow_none: bool = False,
) -> Optional[FieldIssue]:
    """
    Validate a date is not in the past.
    If allow_none=True, a None/empty value returns None (VALID).
    """
    if value is None:
        if allow_none:
            return None
        return FieldIssue(
            field_name=field_name,
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message=f"{field_name} is required.",
            original_value=None,
        )
    today = date.today()
    try:
        d = value if isinstance(value, date) else date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return FieldIssue(
            field_name=field_name,
            severity=Severity.ERROR,
            issue_type=IssueType.INVALID_FORMAT,
            message=f"{field_name} must be a valid date (YYYY-MM-DD).",
            original_value=value,
        )
    if d < today:
        return FieldIssue(
            field_name=field_name,
            severity=Severity.WARNING,
            issue_type=IssueType.BUSINESS_RULE_WARNING,
            message=f"{field_name} is in the past.",
            original_value=value,
        )
    return None


def validate_date_ordering(
    mfg_field: str,
    expiry_field: str,
    mfg_value: Any,
    expiry_value: Any,
) -> Optional[FieldIssue]:
    """
    Return ERROR if manufacturing date is on or after expiry date.
    Caller should only invoke this if both dates are present and valid.
    """
    if mfg_value is None or expiry_value is None:
        return None
    try:
        mfg = mfg_value if isinstance(mfg_value, date) else date.fromisoformat(str(mfg_value))
        exp = expiry_value if isinstance(expiry_value, date) else date.fromisoformat(str(expiry_value))
    except (TypeError, ValueError):
        return None  # Format errors handled elsewhere

    if mfg >= exp:
        return FieldIssue(
            field_name=expiry_field,
            severity=Severity.ERROR,
            issue_type=IssueType.BUSINESS_RULE_WARNING,
            message=f"Manufacturing date must be before expiry date.",
            original_value=str(expiry_value),
        )
    return None

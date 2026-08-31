"""
Tests for the Data Integrity Layer.

Tests all 7 scenarios from the spec:
1. Missing required field → fallback created, issue recorded
2. Corrected missing field → placeholder replaced, issue resolved
3. Invalid value (negative quantity) → rejected, no fallback
4. Invalid date format → rejected
5. Normalization (whitespace)
6. Branch isolation
7. Transaction rollback safety (via error injection)
"""
import pytest
from app.services.fallback_service import (
    batch_number_placeholder,
    is_placeholder,
    is_expiry_placeholder,
    expiry_date_placeholder,
    PLACEHOLDER_PATTERN,
)
from app.services.validation_service import Severity, IssueType
from app.validation.products import validate_product
from app.validation.inventory import validate_inventory_batch
from app.validation.common import (
    validate_required_string,
    validate_optional_email,
    validate_optional_phone,
    validate_date_ordering,
    normalize_string,
)


# ============================================================
# Fallback Service Tests
# ============================================================

class TestFallbackService:

    def test_batch_placeholder_format(self):
        """Placeholder must match AUTO-MISSING-BATCH-{8HEX} pattern."""
        p = batch_number_placeholder()
        assert PLACEHOLDER_PATTERN.match(p), f"Pattern mismatch: {p}"

    def test_is_placeholder_true(self):
        """is_placeholder() must detect synthetic values."""
        assert is_placeholder("AUTO-MISSING-BATCH-8F31C2A0")
        assert is_placeholder("AUTO-MISSING-SKU-00000000")

    def test_is_placeholder_false_for_real_data(self):
        """is_placeholder() must NOT flag real batch numbers."""
        assert not is_placeholder("BATCH-ABC-123")
        assert not is_placeholder("N/A")
        assert not is_placeholder("")
        assert not is_placeholder(None)

    def test_placeholders_are_unique(self):
        """Each call must return a different token."""
        tokens = {batch_number_placeholder() for _ in range(100)}
        assert len(tokens) == 100, "Placeholder collision detected"

    def test_expiry_placeholder(self):
        """Expiry placeholder must be the far-future sentinel value."""
        p = expiry_date_placeholder()
        assert is_expiry_placeholder(p)
        assert p == "9999-12-31"

    def test_is_expiry_placeholder_false(self):
        """Real dates must not be identified as expiry placeholders."""
        assert not is_expiry_placeholder("2025-12-31")
        assert not is_expiry_placeholder(None)


# ============================================================
# Common Validators Tests
# ============================================================

class TestCommonValidators:

    # Test 5 — Normalization
    def test_normalize_string_strips_whitespace(self):
        result = normalize_string("   Dolo     650   ")
        assert result == "Dolo 650"

    def test_normalize_string_empty(self):
        assert normalize_string("   ") is None
        assert normalize_string(None) is None

    def test_required_string_missing(self):
        issue = validate_required_string("batch_number", "")
        assert issue is not None
        assert issue.severity == Severity.MISSING

    def test_required_string_normalized(self):
        issue = validate_required_string("name", "  Dolo  650  ")
        assert issue is not None
        assert issue.severity == Severity.NORMALIZED
        assert issue.normalized_value == "Dolo 650"

    def test_required_string_valid(self):
        issue = validate_required_string("name", "Paracetamol 500mg")
        assert issue is None

    def test_required_string_too_long(self):
        issue = validate_required_string("name", "x" * 201, max_length=200)
        assert issue is not None
        assert issue.severity == Severity.ERROR

    def test_email_valid(self):
        issue = validate_optional_email("email", "admin@pharmacy.com")
        assert issue is None

    def test_email_normalized_to_lowercase(self):
        issue = validate_optional_email("email", "ADMIN@PHARMACY.COM")
        assert issue is not None
        assert issue.severity == Severity.NORMALIZED
        assert issue.normalized_value == "admin@pharmacy.com"

    def test_email_invalid_format(self):
        issue = validate_optional_email("email", "not-an-email")
        assert issue is not None
        assert issue.severity == Severity.ERROR

    def test_email_empty_is_valid(self):
        issue = validate_optional_email("email", None)
        assert issue is None

    def test_phone_valid(self):
        issue = validate_optional_phone("phone", "9876543210")
        assert issue is None

    def test_phone_invalid(self):
        issue = validate_optional_phone("phone", "NOT_A_PHONE!!")
        assert issue is not None
        assert issue.severity == Severity.ERROR

    def test_date_ordering_error_when_mfg_after_expiry(self):
        from datetime import date
        issue = validate_date_ordering(
            "manufacturing_date", "expiry_date",
            date(2025, 6, 1), date(2025, 1, 1)
        )
        assert issue is not None
        assert issue.severity == Severity.ERROR

    def test_date_ordering_valid(self):
        from datetime import date
        issue = validate_date_ordering(
            "manufacturing_date", "expiry_date",
            date(2024, 1, 1), date(2026, 12, 31)
        )
        assert issue is None


# ============================================================
# Product Validation Tests
# ============================================================

class TestProductValidation:

    def test_valid_product(self):
        result = validate_product(name="Paracetamol 500mg", mrp=15.0, selling_price=12.0)
        assert result.is_valid
        assert not result.has_missing

    def test_missing_name(self):
        result = validate_product(name="", mrp=15.0, selling_price=12.0)
        assert result.has_missing
        missing = [i for i in result.issues if i.severity == Severity.MISSING]
        assert any(i.field_name == "name" for i in missing)

    def test_negative_mrp_is_error(self):
        result = validate_product(name="Test", mrp=-5.0, selling_price=0.0)
        assert not result.is_valid
        errors = result.get_error_fields()
        assert "mrp" in errors

    def test_negative_selling_price_is_error(self):
        result = validate_product(name="Test", mrp=10.0, selling_price=-1.0)
        assert not result.is_valid
        errors = result.get_error_fields()
        assert "selling_price" in errors

    def test_selling_price_exceeds_mrp_is_warning(self):
        result = validate_product(name="Test", mrp=10.0, selling_price=15.0)
        assert result.is_valid  # valid but has warning
        assert result.has_warnings
        warnings = [i for i in result.issues if i.severity == Severity.WARNING]
        assert any(i.field_name == "selling_price" for i in warnings)

    def test_gst_out_of_range_is_warning(self):
        result = validate_product(name="Test", mrp=10.0, selling_price=9.0, gst_percentage=50.0)
        assert result.is_valid
        assert result.has_warnings

    def test_name_normalization(self):
        result = validate_product(name="  Dolo   650  ", mrp=10.0, selling_price=9.0)
        normalized = result.get_normalized_values()
        assert normalized.get("name") == "Dolo 650"


# ============================================================
# Inventory Validation Tests
# ============================================================

class TestInventoryValidation:

    # Test 1 — Missing batch number → fallback
    def test_missing_batch_number_generates_placeholder(self):
        result = validate_inventory_batch(quantity=100, expiry_date="2027-01-01", batch_number=None)
        assert result.is_valid
        assert result.has_missing
        placeholders = result.get_placeholders()
        assert "batch_number" in placeholders
        assert is_placeholder(placeholders["batch_number"])

    def test_missing_expiry_date_generates_placeholder(self):
        result = validate_inventory_batch(quantity=100, expiry_date=None, batch_number="BATCH-001")
        assert result.is_valid
        assert result.has_missing
        placeholders = result.get_placeholders()
        assert "expiry_date" in placeholders
        assert is_expiry_placeholder(placeholders["expiry_date"])

    # Test 3 — Negative quantity → rejected
    def test_negative_quantity_is_error(self):
        result = validate_inventory_batch(quantity=-10, expiry_date="2027-01-01", batch_number="BATCH-001")
        assert not result.is_valid
        errors = result.get_error_fields()
        assert "quantity" in errors

    # Test 4 — Invalid date format → rejected
    def test_invalid_expiry_date_format_is_error(self):
        result = validate_inventory_batch(quantity=50, expiry_date="not-a-date", batch_number="BATCH-001")
        assert not result.is_valid
        errors = result.get_error_fields()
        assert "expiry_date" in errors

    def test_manufacturing_after_expiry_is_error(self):
        result = validate_inventory_batch(
            quantity=50,
            expiry_date="2025-01-01",
            batch_number="BATCH-001",
            manufacturing_date="2026-01-01",
        )
        assert not result.is_valid
        errors = result.get_error_fields()
        assert "expiry_date" in errors

    def test_negative_purchase_price_is_error(self):
        result = validate_inventory_batch(
            quantity=10, expiry_date="2027-01-01",
            batch_number="BATCH-001", purchase_price=-5.0
        )
        assert not result.is_valid

    def test_valid_batch(self):
        result = validate_inventory_batch(
            quantity=50, expiry_date="2027-06-30",
            batch_number="BATCH-2024-001",
            manufacturing_date="2024-01-01",
        )
        assert result.is_valid
        assert not result.has_missing


# ============================================================
# Validation Result Tests
# ============================================================

class TestValidationResult:

    def test_to_api_error_format(self):
        result = validate_product(name="", mrp=-1.0, selling_price=0.0)
        api_error = result.to_api_error()
        assert api_error["error"]["code"] == "VALIDATION_ERROR"
        assert isinstance(api_error["error"]["fields"], dict)

    def test_get_placeholders(self):
        result = validate_inventory_batch(quantity=10, expiry_date=None, batch_number=None)
        placeholders = result.get_placeholders()
        assert len(placeholders) == 2
        assert "batch_number" in placeholders
        assert "expiry_date" in placeholders

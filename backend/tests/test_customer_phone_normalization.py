import pytest
from app.utils.phone import normalize_phone
from app.database.database import SessionLocal
from app.models.customer import Customer
import app.models  # noqa

class TestCustomerPhoneNormalization:
    def test_phone_normalization_utility(self):
        # 10 digits
        raw, norm = normalize_phone("9145887170")
        assert raw == "9145887170"
        assert norm == "9145887170"

        # +91 with spaces and hyphens
        raw, norm = normalize_phone("+91 91458-87170")
        assert raw == "+91 91458-87170"
        assert norm == "9145887170"

        # 0 prefix (11 digits)
        raw, norm = normalize_phone("09145887170")
        assert raw == "09145887170"
        assert norm == "9145887170"

        # None or empty
        raw, norm = normalize_phone(None)
        assert raw is None
        assert norm is None

        raw, norm = normalize_phone("   ")
        assert raw == ""
        assert norm is None

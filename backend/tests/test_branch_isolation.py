import pytest
from fastapi import HTTPException
import app.models  # noqa
from app.api import deps
from app.models.user import User, RoleEnum

class TestBranchIsolation:
    def test_staff_cannot_access_other_branch(self):
        staff_b1 = User(
            id=101,
            email="staff1@medx.com",
            role=RoleEnum.STAFF,
            branch_id=1,
            is_active=True
        )

        # Accessing own branch -> OK
        assert deps.get_authorized_branch_id(1, staff_b1) == 1
        assert deps.get_authorized_branch_id(None, staff_b1) == 1

        # Attempting to access branch 2 -> 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            deps.get_authorized_branch_id(2, staff_b1)
        assert exc_info.value.status_code == 403

    def test_admin_cannot_access_other_branch(self):
        admin_b2 = User(
            id=102,
            email="admin2@medx.com",
            role=RoleEnum.ADMIN,
            branch_id=2,
            is_active=True
        )

        # Accessing own branch -> OK
        assert deps.get_authorized_branch_id(2, admin_b2) == 2

        # Attempting to access branch 1 -> 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            deps.get_authorized_branch_id(1, admin_b2)
        assert exc_info.value.status_code == 403

    def test_superadmin_can_access_any_branch_or_all(self):
        superadmin = User(
            id=999,
            email="owner@medx.com",
            role=RoleEnum.SUPERADMIN,
            branch_id=None,
            is_active=True
        )

        # Accessing branch 1 -> OK
        assert deps.get_authorized_branch_id(1, superadmin) == 1

        # Accessing branch 2 -> OK
        assert deps.get_authorized_branch_id(2, superadmin) == 2

        # Accessing all branches (None) -> OK
        assert deps.get_authorized_branch_id(None, superadmin) is None

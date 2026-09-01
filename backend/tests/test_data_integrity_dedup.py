import pytest
from app.database.database import SessionLocal
from app.models.data_integrity import DataIntegrityIssue
from app.services.validation_service import FieldIssue, Severity, IssueType
from app.services.data_integrity_service import create_issue_from_field_issue, resolve_issue

class TestDataIntegrityDedup:
    @pytest.fixture(autouse=True)
    def setup_method(self):
        self.db = SessionLocal()
        yield
        self.db.close()

    def test_duplicate_active_issue_is_prevented(self):
        fi = FieldIssue(
            field_name="batch_number",
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message="Batch number is missing",
            placeholder_value="AUTO-MISSING-BATCH-AAA111",
            original_value=""
        )

        # First creation
        issue1 = create_issue_from_field_issue(
            db=self.db,
            entity_type="inventory_batch",
            entity_id=99999,
            field_issue=fi,
            branch_id=1
        )
        self.db.commit()

        # Second creation with slightly updated placeholder
        fi2 = FieldIssue(
            field_name="batch_number",
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message="Batch number is missing (retry)",
            placeholder_value="AUTO-MISSING-BATCH-BBB222",
            original_value=""
        )
        issue2 = create_issue_from_field_issue(
            db=self.db,
            entity_type="inventory_batch",
            entity_id=99999,
            field_issue=fi2,
            branch_id=1
        )
        self.db.commit()

        # Must return the SAME record, not create a duplicate
        assert issue1.id == issue2.id

        # Verify only 1 active issue exists
        count = self.db.query(DataIntegrityIssue).filter(
            DataIntegrityIssue.entity_type == "inventory_batch",
            DataIntegrityIssue.entity_id == 99999,
            DataIntegrityIssue.field_name == "batch_number",
            DataIntegrityIssue.resolved_at == None
        ).count()
        assert count == 1

        # Clean up
        self.db.delete(issue1)
        self.db.commit()

    def test_resolve_issue_records_correction_metadata(self):
        fi = FieldIssue(
            field_name="expiry_date",
            severity=Severity.MISSING,
            issue_type=IssueType.MISSING_REQUIRED_FIELD,
            message="Expiry date is missing",
            placeholder_value="9999-12-31"
        )
        issue = create_issue_from_field_issue(
            db=self.db,
            entity_type="inventory_batch",
            entity_id=88888,
            field_issue=fi,
            branch_id=1
        )
        self.db.commit()

        resolved = resolve_issue(
            db=self.db,
            issue_id=issue.id,
            resolved_by_user_id=1,
            corrected_value="2027-06-30",
            notes="Checked physically on the box"
        )
        self.db.commit()

        assert resolved.is_resolved
        assert "2027-06-30" in resolved.metadata_json
        assert "Checked physically on the box" in resolved.metadata_json

        # Clean up
        self.db.delete(resolved)
        self.db.commit()

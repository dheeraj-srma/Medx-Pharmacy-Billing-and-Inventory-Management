"""
Validation Service

Centralized validation pipeline. Returns structured ValidationResult objects
with severity, field, normalized value, and messages.

Architecture:
    User Input → Normalize → Required Check → Type/Format Check → Range/Business Check
    → ValidationResult (VALID | NORMALIZED | MISSING | WARNING | ERROR)
"""
from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum


class Severity(str, Enum):
    VALID = "VALID"
    NORMALIZED = "NORMALIZED"
    MISSING = "MISSING"
    WARNING = "WARNING"
    ERROR = "ERROR"


class IssueType(str, Enum):
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    INVALID_FORMAT = "INVALID_FORMAT"
    INVALID_VALUE = "INVALID_VALUE"
    BUSINESS_RULE_WARNING = "BUSINESS_RULE_WARNING"
    NORMALIZED_VALUE = "NORMALIZED_VALUE"


@dataclass
class FieldIssue:
    """A single validation finding for one field."""
    field_name: str
    severity: Severity
    issue_type: IssueType
    message: str
    original_value: Any = None
    normalized_value: Any = None   # Set only if normalization changed the value
    placeholder_value: Optional[str] = None  # Set only if a fallback was generated


@dataclass
class ValidationResult:
    """Aggregated result for a full entity validation pass."""
    is_valid: bool = True          # False if any ERROR severity issues exist
    has_missing: bool = False      # True if any MISSING fields exist
    has_warnings: bool = False     # True if any WARNING issues exist
    issues: list = field(default_factory=list)  # List[FieldIssue]

    def add_issue(self, issue: FieldIssue) -> None:
        self.issues.append(issue)
        if issue.severity == Severity.ERROR:
            self.is_valid = False
        elif issue.severity == Severity.MISSING:
            self.has_missing = True
        elif issue.severity == Severity.WARNING:
            self.has_warnings = True

    def get_error_fields(self) -> dict:
        """Return {field_name: message} for all ERROR-severity issues."""
        return {
            i.field_name: i.message
            for i in self.issues
            if i.severity == Severity.ERROR
        }

    def get_normalized_values(self) -> dict:
        """Return {field_name: normalized_value} for all NORMALIZED fields."""
        return {
            i.field_name: i.normalized_value
            for i in self.issues
            if i.severity == Severity.NORMALIZED and i.normalized_value is not None
        }

    def get_placeholders(self) -> dict:
        """Return {field_name: placeholder_value} for all MISSING fields with placeholders."""
        return {
            i.field_name: i.placeholder_value
            for i in self.issues
            if i.severity == Severity.MISSING and i.placeholder_value is not None
        }

    def to_api_error(self) -> dict:
        """Format for HTTP 422 structured error response."""
        return {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The submitted information contains invalid values.",
                "fields": self.get_error_fields()
            }
        }

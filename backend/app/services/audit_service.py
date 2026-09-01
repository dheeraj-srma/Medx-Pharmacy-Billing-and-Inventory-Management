import json
import logging
from typing import Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime, date
from decimal import Decimal
from app.core.timezone import IST
from app.models.audit_log import AuditLog

logger = logging.getLogger("audit_service")

def _json_serial(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return str(obj)
    return str(obj)

class AuditService:
    @staticmethod
    def log(
        db: Session,
        action: str,
        user_id: Optional[int] = None,
        branch_id: Optional[int] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[Any] = None,
        old_value: Optional[Any] = None,
        new_value: Optional[Any] = None,
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        """
        Record an immutable audit trail entry.
        Designed to be called inside active database transactions.
        """
        try:
            old_str = json.dumps(old_value, default=_json_serial) if isinstance(old_value, (dict, list)) else (str(old_value) if old_value is not None else None)
            new_str = json.dumps(new_value, default=_json_serial) if isinstance(new_value, (dict, list)) else (str(new_value) if new_value is not None else None)
            meta_str = json.dumps(metadata, default=_json_serial) if metadata is not None else None

            log_entry = AuditLog(
                user_id=user_id,
                branch_id=branch_id,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id is not None else None,
                old_value=old_str,
                new_value=new_str,
                metadata_json=meta_str,
                ip_address=ip_address,
                timestamp=datetime.now(IST)
            )
            db.add(log_entry)
            return log_entry
        except Exception:
            logger.exception(f"Failed to record audit log for action: {action}")
            # Non-blocking: audit failure must not crash business workflows if handled gracefully
            return None

import pytest
from datetime import timedelta
from fastapi import HTTPException
from jose import jwt
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.api import deps
from app.models.user import User, RoleEnum
from app.database.database import SessionLocal

class TestSecurityHardening:
    @pytest.fixture(autouse=True)
    def setup_db(self):
        self.db = SessionLocal()
        yield
        self.db.close()

    def test_disabled_user_cannot_access_protected_endpoint(self):
        deactivated_user = User(
            id=7771,
            email="deactivated@medx.com",
            hashed_password=get_password_hash("password123"),
            full_name="Deactivated Staff",
            role=RoleEnum.STAFF,
            branch_id=1,
            is_active=False
        )
        with pytest.raises(HTTPException) as exc_info:
            deps.get_current_active_user(deactivated_user)
        assert exc_info.value.status_code == 401
        assert "deactivated" in exc_info.value.detail.lower()

    def test_expired_token_is_rejected(self):
        expired_token = create_access_token(
            subject=1,
            expires_delta=timedelta(minutes=-10)
        )
        with pytest.raises(HTTPException) as exc_info:
            deps.get_current_user(db=self.db, token=expired_token)
        assert exc_info.value.status_code == 401
        assert "could not validate credentials" in exc_info.value.detail.lower()

    def test_invalid_signature_token_is_rejected(self):
        tampered_token = jwt.encode(
            {"sub": "1", "exp": 9999999999},
            "completely_wrong_secret_key_1234567890",
            algorithm="HS256"
        )
        with pytest.raises(HTTPException) as exc_info:
            deps.get_current_user(db=self.db, token=tampered_token)
        assert exc_info.value.status_code == 401

    def test_production_environment_fails_if_insecure_secret(self, monkeypatch):
        from app.core.config import Settings, _INSECURE_DEFAULT_SECRET
        with pytest.raises(RuntimeError) as exc_info:
            Settings(
                ENVIRONMENT="production",
                DATABASE_URL="postgresql://user:pass@localhost:5432/db",
                SECRET_KEY=_INSECURE_DEFAULT_SECRET
            )
        assert "insecure development default" in str(exc_info.value).lower()

    def test_production_environment_fails_if_cors_wildcard(self, monkeypatch):
        from app.core.config import Settings
        with pytest.raises(RuntimeError) as exc_info:
            Settings(
                ENVIRONMENT="production",
                DATABASE_URL="postgresql://user:pass@localhost:5432/db",
                SECRET_KEY="secure_random_production_key_abcdef1234567890",
                CORS_ORIGINS=["*"]
            )
        assert "wildcard" in str(exc_info.value).lower()

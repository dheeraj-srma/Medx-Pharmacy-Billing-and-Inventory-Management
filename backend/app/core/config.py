import os
import sys
import logging
from typing import List, Union
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("config")

# Known insecure default — used only for local development convenience.
# Production MUST override this via the SECRET_KEY environment variable.
_INSECURE_DEFAULT_SECRET = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"


class Settings(BaseSettings):
    PROJECT_NAME: str = "MedX Pharmacy Management API"
    VERSION: str = "2.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"  # "development", "staging", "production"

    # Database
    DATABASE_URL: str | None = None

    # JWT Authentication
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120  # 2 hours

    # CORS Origins (JSON list or comma-delimited string)
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            # Normalize postgres:// to postgresql:// for SQLAlchemy compatibility
            if self.DATABASE_URL.startswith("postgres://"):
                return self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
            return self.DATABASE_URL

        # Strict Production Enforcement: Never silently switch to SQLite in production!
        if self.ENVIRONMENT == "production":
            raise RuntimeError(
                "CRITICAL CONFIGURATION ERROR: DATABASE_URL is not set. "
                "Production environment requires a valid PostgreSQL database connection string."
            )

        # Allow SQLite only in development mode if explicitly selected or default
        return "sqlite:///./medical_store.db"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_secret_key_secure(self) -> bool:
        """Returns False if the SECRET_KEY is the known insecure development default."""
        return self.SECRET_KEY != _INSECURE_DEFAULT_SECRET

    @model_validator(mode="after")
    def validate_production_invariants(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if not self.DATABASE_URL:
                raise RuntimeError("DATABASE_URL is required in production environment.")
            if not self.is_secret_key_secure:
                raise RuntimeError(
                    "SECRET_KEY is set to the insecure development default. "
                    "Generate a secure key: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
            if "*" in self.CORS_ORIGINS:
                raise RuntimeError(
                    "CORS_ORIGINS contains wildcard '*'. "
                    "Production must explicitly list allowed origins."
                )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

# ── Production Safety Checks (fail-fast on import) ──────────────────────────
if settings.is_production:
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required in production environment.")
    if not settings.is_secret_key_secure:
        raise RuntimeError(
            "SECRET_KEY is set to the insecure development default. "
            "Generate a secure key: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if "*" in settings.CORS_ORIGINS:
        raise RuntimeError(
            "CORS_ORIGINS contains wildcard '*'. "
            "Production must explicitly list allowed origins."
        )

# ── Development Warnings ─────────────────────────────────────────────────────
if not settings.is_production:
    if not settings.is_secret_key_secure:
        logger.warning(
            "SECRET_KEY is the insecure development default. "
            "Set SECRET_KEY env var before deploying to production."
        )


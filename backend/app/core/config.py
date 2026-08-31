import os
import sys
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "MedX Pharmacy Management API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development" # "development", "staging", "production"
    
    # Database
    DATABASE_URL: str | None = None
    
    # JWT Authentication
    SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120 # 2 hours
    
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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Validate production requirements on import
if settings.ENVIRONMENT == "production":
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required in production environment.")
    if settings.SECRET_KEY == "dev-secret-key-change-in-production-medical-store-2026":
        raise RuntimeError("A secure SECRET_KEY must be configured in production environment.")

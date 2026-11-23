"""Application settings, loaded once from environment variables / backend/.env."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MONOLOOP API"
    environment: Literal["development", "test", "production"] = "development"

    # --- Data -----------------------------------------------------------------
    # Supabase "Session pooler" URI (postgresql://...:5432/postgres). Empty = in-memory demo data.
    database_url: str = ""
    # "auto": Postgres when DATABASE_URL is set, else Supabase REST when SUPABASE_URL and
    # SUPABASE_SERVICE_ROLE_KEY are set, else the in-memory store.
    data_backend: Literal["auto", "memory", "postgres", "supabase"] = "auto"
    # Supabase REST access (used when the database password is not available).
    # The service-role key bypasses row-level security: backend only, never in the frontend.
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    db_pool_size: int = Field(default=10, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    db_statement_timeout_ms: int = Field(default=8000, ge=100)

    # --- HTTP / security -------------------------------------------------------
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    rate_limit_per_minute: int = Field(default=240, ge=1)
    rate_limit_writes_per_minute: int = Field(default=60, ge=1)
    max_body_bytes: int = Field(default=64 * 1024, ge=1024)
    # "demo": acting organization comes from the X-Organization-Id header (demo org switcher).
    # "jwt":  a Supabase access token is required; the organization comes from its app_metadata.
    auth_mode: Literal["demo", "jwt"] = "demo"
    supabase_jwks_url: str = ""
    jwt_audience: str = "authenticated"

    # --- AI extraction ------------------------------------------------------
    ai_provider: Literal["gemini", "openai"] = "gemini"
    ai_api_key: str = ""
    ai_model: str = ""
    ai_endpoint: str = ""
    ai_timeout_seconds: float = Field(default=12.0, gt=0, le=60)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        # Allow CORS_ORIGINS=http://a,http://b as well as a JSON list.
        if isinstance(value, str) and not value.strip().startswith("["):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @property
    def use_postgres(self) -> bool:
        if self.data_backend == "postgres":
            return True
        if self.data_backend in ("memory", "supabase"):
            return False
        return bool(self.database_url.strip())

    @property
    def supabase_rest_configured(self) -> bool:
        return bool(self.supabase_url.strip()) and bool(self.supabase_service_role_key.strip())

    @property
    def use_supabase_rest(self) -> bool:
        if self.data_backend == "supabase":
            return True
        if self.data_backend == "auto":
            return not self.database_url.strip() and self.supabase_rest_configured
        return False

    @property
    def async_database_url(self) -> str:
        """Supabase gives a plain postgresql:// URI; SQLAlchemy needs the asyncpg driver."""
        url = self.database_url.strip()
        for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+asyncpg://" + url[len(prefix):]
        return url

    @property
    def ai_configured(self) -> bool:
        key = self.ai_api_key.strip()
        return bool(key) and "your-llm-api-key" not in key


@lru_cache
def get_settings() -> Settings:
    return Settings()

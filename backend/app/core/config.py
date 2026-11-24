"""Application settings, loaded once from environment variables / backend/.env."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, ValidationInfo, field_validator
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
    # Offline demo only (no Supabase configured): create this admin at startup in the in-process
    # login provider. For Supabase use `python -m app.scripts.create_admin` once instead.
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    # Offline demo only: give every seeded company a login <name>@monoloop.demo with this password.
    bootstrap_demo_password: str = ""
    supabase_jwks_url: str = ""
    jwt_audience: str = "authenticated"

    # --- Payments (SSLCommerz) --------------------------------------------------
    # "none" turns online payment off: exchanges complete without payment, as before.
    payment_provider: Literal["none", "sslcommerz"] = "none"
    sslcommerz_store_id: str = ""
    sslcommerz_store_password: str = ""
    sslcommerz_sandbox: bool = True
    # Where the browser reaches this API (gateway redirects back here) and the frontend.
    public_api_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"

    # --- AI extraction ------------------------------------------------------
    ai_provider: Literal["gemini", "openai"] = "gemini"
    ai_api_key: str = ""
    ai_model: str = ""
    ai_endpoint: str = ""
    ai_timeout_seconds: float = Field(default=10.0, gt=0, le=60)  # per attempt
    # Hosted models return 503 "overloaded" fairly often: retry with backoff inside one overall budget,
    # which must stay under the frontend's 30 s request timeout.
    ai_max_attempts: int = Field(default=3, ge=1, le=5)
    ai_total_timeout_seconds: float = Field(default=24.0, gt=0, le=120)
    ai_retry_backoff_seconds: float = Field(default=0.8, ge=0, le=10)
    # Voice input fallback (browsers without the Web Speech API upload a short recording).
    ai_transcribe_model: str = ""
    ai_transcribe_endpoint: str = ""
    max_audio_bytes: int = Field(default=1_500_000, ge=10_000, le=15_000_000)

    @field_validator("supabase_url", "supabase_service_role_key", "ai_api_key", "sslcommerz_store_id",
                     "sslcommerz_store_password", "database_url", "public_api_url", "frontend_url", mode="before")
    @classmethod
    def _clean_pasted_value(cls, value: object, info: ValidationInfo) -> object:
        # Dashboard copy/paste often adds spaces, a line break or wrapping quotes. Keys, ids and
        # passwords never contain whitespace, so it is removed entirely; URLs are only trimmed.
        if not isinstance(value, str):
            return value
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1].strip()
        if not info.field_name.endswith("url"):
            value = "".join(value.split())
        return value

    @field_validator("supabase_url")
    @classmethod
    def _check_supabase_url(cls, value: str) -> str:
        value = value.rstrip("/")
        for suffix in ("/rest/v1",):
            if value.endswith(suffix):
                value = value[: -len(suffix)]
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("SUPABASE_URL must start with https:// (e.g. https://<ref>.supabase.co)")
        return value

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
    def payment_configured(self) -> bool:
        return (self.payment_provider == "sslcommerz" and bool(self.sslcommerz_store_id.strip())
                and bool(self.sslcommerz_store_password.strip()))

    @property
    def max_transcribe_body_bytes(self) -> int:
        """Base64 adds a third, plus room for the JSON wrapper."""
        return self.max_audio_bytes * 4 // 3 + 4096

    @property
    def ai_configured(self) -> bool:
        key = self.ai_api_key.strip()
        return bool(key) and "your-llm-api-key" not in key


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Async SQLAlchemy engine for Supabase PostgreSQL (asyncpg driver).

Use the Supabase *Session pooler* URI (port 5432): FastAPI is a long-running server, so it keeps
its own connection pool and asyncpg's prepared-statement cache (faster than the transaction
pooler, which would require NullPool and disabling the cache).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import Settings


def create_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        settings.async_database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=True,  # survive pooler-side idle disconnects
        pool_recycle=300,
        connect_args={
            "command_timeout": settings.db_statement_timeout_ms / 1000,  # client-side query timeout
            "server_settings": {"application_name": "monoloop-api"},
        },
    )

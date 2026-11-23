"""MONOLOOP API: FastAPI application factory.

Run:  uvicorn app.main:app --reload --port 8000      (docs at http://localhost:8000/docs)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.deps import build_container
from app.api.routes import demand, exchange, matching, payment, supply, system
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.middleware import (
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("monoloop")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        container = build_container(settings)
        app.state.container = container
        logger.info("MONOLOOP API started (data backend: %s, auth: %s)", container.repos.backend, settings.auth_mode)
        yield
        await container.aclose()

    is_prod = settings.environment == "production"
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Supply, demand, explainable matching, exchanges and resource-recovery analytics. "
                    "Every response uses the envelope `{success, data, error, meta}`.",
        lifespan=lifespan,
        # API docs are a development tool; keep them off the public production surface.
        docs_url=None if is_prod else "/docs",
        redoc_url=None if is_prod else "/redoc",
        openapi_url=None if is_prod else "/openapi.json",
    )
    register_exception_handlers(app)
    for module in (system, supply, demand, matching, exchange, payment):
        app.include_router(module.router)

    # Added innermost first; the last one added runs first on each request.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(RateLimitMiddleware, reads_per_minute=settings.rate_limit_per_minute,
                       writes_per_minute=settings.rate_limit_writes_per_minute)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(SecurityHeadersMiddleware, hsts=is_prod)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "X-Organization-Id", "Authorization", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Server-Timing", "Retry-After"],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)
    return app


app = create_app()

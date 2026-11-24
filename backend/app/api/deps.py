"""Composition root (Factory + dependency injection).

The container is built once in the app lifespan: it picks the repository implementation
(in-memory or PostgreSQL), owns the shared resources (DB pool, HTTP client) and wires the
services. Routers receive services through FastAPI's Depends, so tests can swap anything.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.repositories.base import Repositories
from app.repositories.memory.payments import MemoryPaymentRepository
from app.repositories.memory.repositories import (
    MemoryChatRepository,
    MemoryExchangeRepository,
    MemoryListingRepository,
    MemoryOrganizationRepository,
    MemoryRequirementRepository,
)
from app.repositories.memory.store import InMemoryStore
from app.services.ai.extraction import ExtractionService
from app.services.ai.transcription import TranscriptionService
from app.services.auth.provider import AuthProvider, LocalAuthProvider, SupabaseAuthProvider
from app.services.auth.service import AuthService
from app.services.chat import ChatService
from app.services.demand import RequirementService
from app.services.exchange import ExchangeService
from app.services.impact import ImpactService
from app.services.matching.service import MatchingService
from app.services.payments.gateway import PaymentGateway, SSLCommerzGateway
from app.services.payments.service import PaymentService
from app.services.supply import ListingService, OrganizationService


@dataclass
class Container:
    settings: Settings
    repos: Repositories
    http: httpx.AsyncClient
    engine: AsyncEngine | None = None
    store: InMemoryStore | None = None
    rest: httpx.AsyncClient | None = None  # Supabase REST client (service-role key)

    def __post_init__(self) -> None:
        self.organizations = OrganizationService(self.repos)
        self.listings = ListingService(self.repos)
        self.requirements = RequirementService(self.repos)
        self.matching = MatchingService(self.repos)
        self.payments = PaymentService(self.repos, self.settings, build_gateway(self.settings, self.http))
        self.exchanges = ExchangeService(self.repos, self.matching, self.payments)
        self.impact = ImpactService(self.repos)
        self.chat = ChatService(self.repos)
        self.extraction = ExtractionService(self.settings, self.http)
        self.auth = AuthService(self.repos, build_auth_provider(self.settings, self.http))
        self.transcription = TranscriptionService(self.settings, self.http)

    async def aclose(self) -> None:
        await self.http.aclose()
        if self.rest is not None:
            await self.rest.aclose()
        if self.engine is not None:
            await self.engine.dispose()


def build_auth_provider(settings: Settings, http: httpx.AsyncClient) -> AuthProvider:
    """Supabase Auth when the project is configured, otherwise in-process accounts (tests, offline demo)."""
    if settings.supabase_rest_configured:
        return SupabaseAuthProvider(http, settings.supabase_url, settings.supabase_service_role_key,
                                    settings.supabase_jwks_url, settings.jwt_audience)
    return LocalAuthProvider()


def build_gateway(settings: Settings, http: httpx.AsyncClient) -> PaymentGateway | None:
    """Payment gateway (Strategy) from settings; None keeps online payment switched off."""
    if not settings.payment_configured:
        return None
    return SSLCommerzGateway(http, settings.sslcommerz_store_id, settings.sslcommerz_store_password,
                             sandbox=settings.sslcommerz_sandbox)


def memory_repositories(store: InMemoryStore) -> Repositories:
    return Repositories(
        organizations=MemoryOrganizationRepository(store),
        listings=MemoryListingRepository(store),
        requirements=MemoryRequirementRepository(store),
        exchanges=MemoryExchangeRepository(store),
        chat=MemoryChatRepository(store),
        backend="memory",
        payments=MemoryPaymentRepository(store),
    )


def postgres_repositories(engine: AsyncEngine) -> Repositories:
    from app.repositories.postgres.payments import PgPaymentRepository
    from app.repositories.postgres.repositories import (
        PgChatRepository,
        PgExchangeRepository,
        PgListingRepository,
        PgOrganizationRepository,
        PgRequirementRepository,
    )

    return Repositories(
        organizations=PgOrganizationRepository(engine),
        listings=PgListingRepository(engine),
        requirements=PgRequirementRepository(engine),
        exchanges=PgExchangeRepository(engine),
        chat=PgChatRepository(engine),
        backend="postgres",
        payments=PgPaymentRepository(engine),
    )


def supabase_repositories(rest: httpx.AsyncClient) -> Repositories:
    from app.repositories.supabase.payments import SupabasePaymentRepository
    from app.repositories.supabase.repositories import (
        SupabaseChatRepository,
        SupabaseExchangeRepository,
        SupabaseListingRepository,
        SupabaseOrganizationRepository,
        SupabaseRequirementRepository,
    )

    return Repositories(
        organizations=SupabaseOrganizationRepository(rest),
        listings=SupabaseListingRepository(rest),
        requirements=SupabaseRequirementRepository(rest),
        exchanges=SupabaseExchangeRepository(rest),
        chat=SupabaseChatRepository(rest),
        backend="supabase",
        payments=SupabasePaymentRepository(rest),
    )


def build_container(settings: Settings) -> Container:
    http = httpx.AsyncClient(limits=httpx.Limits(max_connections=20, max_keepalive_connections=10))
    if settings.use_supabase_rest:
        if not settings.supabase_rest_configured:
            raise RuntimeError("DATA_BACKEND=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env")
        from app.repositories.supabase.repositories import create_rest_client

        rest = create_rest_client(settings.supabase_url, settings.supabase_service_role_key)
        return Container(settings, supabase_repositories(rest), http, rest=rest)
    if settings.use_postgres:
        from app.db.session import create_engine

        engine = create_engine(settings)
        return Container(settings, postgres_repositories(engine), http, engine=engine)
    store = InMemoryStore()
    return Container(settings, memory_repositories(store), http, store=store)


def get_container(request: Request) -> Container:
    return request.app.state.container


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.container.settings


ContainerDep = Annotated[Container, Depends(get_container)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]

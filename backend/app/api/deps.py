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
from app.repositories.memory.repositories import (
    MemoryExchangeRepository,
    MemoryListingRepository,
    MemoryOrganizationRepository,
    MemoryRequirementRepository,
)
from app.repositories.memory.store import InMemoryStore
from app.services.ai.extraction import ExtractionService
from app.services.demand import RequirementService
from app.services.exchange import ExchangeService
from app.services.impact import ImpactService
from app.services.matching.service import MatchingService
from app.services.supply import ListingService, OrganizationService


@dataclass
class Container:
    settings: Settings
    repos: Repositories
    http: httpx.AsyncClient
    engine: AsyncEngine | None = None
    store: InMemoryStore | None = None

    def __post_init__(self) -> None:
        self.organizations = OrganizationService(self.repos)
        self.listings = ListingService(self.repos)
        self.requirements = RequirementService(self.repos)
        self.matching = MatchingService(self.repos)
        self.exchanges = ExchangeService(self.repos, self.matching)
        self.impact = ImpactService(self.repos)
        self.extraction = ExtractionService(self.settings, self.http)

    async def aclose(self) -> None:
        await self.http.aclose()
        if self.engine is not None:
            await self.engine.dispose()


def memory_repositories(store: InMemoryStore) -> Repositories:
    return Repositories(
        organizations=MemoryOrganizationRepository(store),
        listings=MemoryListingRepository(store),
        requirements=MemoryRequirementRepository(store),
        exchanges=MemoryExchangeRepository(store),
        backend="memory",
    )


def postgres_repositories(engine: AsyncEngine) -> Repositories:
    from app.repositories.postgres.repositories import (
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
        backend="postgres",
    )


def build_container(settings: Settings) -> Container:
    http = httpx.AsyncClient(limits=httpx.Limits(max_connections=20, max_keepalive_connections=10))
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

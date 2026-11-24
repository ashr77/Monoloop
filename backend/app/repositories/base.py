"""Repository interfaces (Repository pattern + dependency inversion).

Services depend only on these Protocols. Three implementations exist:
    memory/    demo + tests: seeded in-process store, atomic via an asyncio lock
    postgres/  Supabase PostgreSQL via SQLAlchemy async + asyncpg (needs the DB password)
    supabase/  Supabase REST (PostgREST) with the service-role key; atomic via the 00004 RPCs
The concrete set is chosen once at startup by app.api.deps (Factory).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

from app.schemas.chat import ChatMessage, ConversationRecord
from app.schemas.entities import Listing, Organization, Requirement
from app.schemas.exchange import ExchangeView

ExchangeActionName = Literal["accept", "reject", "complete", "cancel"]


@dataclass(frozen=True, slots=True)
class ListingFilter:
    organization_id: str | None = None
    material_family: str | None = None
    material_families: tuple[str, ...] | None = None
    status: str | None = None
    search: str | None = None


@dataclass(frozen=True, slots=True)
class RequirementFilter:
    organization_id: str | None = None
    material_family: str | None = None
    status: str | None = None


@dataclass(frozen=True, slots=True)
class ExchangeFilter:
    organization_id: str | None = None  # buyer, or supplier of at least one item
    status: str | None = None


@dataclass(frozen=True, slots=True)
class ExchangeStatistics:
    pending_match_requirement_ids: list[str] = field(default_factory=list)
    fulfilled_quantities: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class NewExchangeItem:
    listing_id: str
    quantity: int


class OrganizationRepository(Protocol):
    async def list(self) -> list[Organization]: ...
    async def get(self, organization_id: str) -> Organization | None: ...


class ListingRepository(Protocol):
    async def list(self, f: ListingFilter) -> list[Listing]: ...
    async def get(self, listing_id: str) -> Listing | None: ...
    async def create(self, data: dict) -> Listing: ...
    async def update(self, listing_id: str, changes: dict) -> Listing | None: ...


class RequirementRepository(Protocol):
    async def list(self, f: RequirementFilter) -> list[Requirement]: ...
    async def get(self, requirement_id: str) -> Requirement | None: ...
    async def create(self, data: dict) -> Requirement: ...
    async def update(self, requirement_id: str, changes: dict) -> Requirement | None: ...
    async def exchange_statistics(self, requirement_ids: list[str]) -> ExchangeStatistics: ...


class ExchangeRepository(Protocol):
    async def list(self, f: ExchangeFilter) -> list[ExchangeView]: ...
    async def get(self, exchange_id: str) -> ExchangeView | None: ...
    async def create(self, requirement_id: str, buyer_id: str, items: list[NewExchangeItem]) -> str: ...
    async def create_listing_order(self, listing_id: str, quantity: int, buyer_id: str) -> str: ...
    async def act(self, action: ExchangeActionName, exchange_id: str, actor_id: str, item_id: str | None) -> None: ...


class ChatRepository(Protocol):
    """Buyer ↔ supplier chat. Writes are atomic with the same rules everywhere
    (PL/pgSQL in migration 00007, mirrored in memory/chat.py)."""

    async def open_conversation(self, listing_id: str, buyer_id: str) -> str: ...
    async def get_conversation(self, conversation_id: str) -> ConversationRecord | None: ...
    async def list_conversations(self, organization_id: str) -> list[ConversationRecord]: ...
    async def messages(self, conversation_id: str, after_seq: int, limit: int) -> list[ChatMessage]: ...
    async def post_message(self, conversation_id: str, actor_id: str, body: str) -> str: ...
    async def mark_read(self, conversation_id: str, actor_id: str) -> None: ...


@dataclass(slots=True)
class Repositories:
    """The unit the rest of the app receives through dependency injection."""

    organizations: OrganizationRepository
    listings: ListingRepository
    requirements: RequirementRepository
    exchanges: ExchangeRepository
    chat: ChatRepository
    backend: Literal["memory", "postgres", "supabase"]

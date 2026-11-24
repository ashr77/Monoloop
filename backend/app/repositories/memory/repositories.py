"""In-memory implementations of the repository interfaces."""

from __future__ import annotations

import uuid

from app.core.errors import AppError
from app.repositories.base import (
    ExchangeActionName,
    ExchangeFilter,
    ExchangeStatistics,
    ListingFilter,
    NewExchangeItem,
    RequirementFilter,
)
from app.repositories.memory import chat, workflow
from app.repositories.memory.store import InMemoryStore
from app.schemas.chat import ChatMessage, ConversationRecord
from app.schemas.entities import Listing, Organization, Requirement, now_iso
from app.schemas.exchange import ExchangeView, build_view


class MemoryOrganizationRepository:
    def __init__(self, store: InMemoryStore):
        self.s = store

    async def list(self) -> list[Organization]:
        return sorted((o.model_copy() for o in self.s.organizations.values()), key=lambda o: o.name)

    async def get(self, organization_id: str) -> Organization | None:
        org = self.s.organizations.get(organization_id)
        return org.model_copy() if org else None


class MemoryListingRepository:
    def __init__(self, store: InMemoryStore):
        self.s = store

    async def list(self, f: ListingFilter) -> list[Listing]:
        q = (f.search or "").lower()
        out = []
        for l in self.s.listings.values():
            if f.organization_id and l.organization_id != f.organization_id:
                continue
            if f.material_family and l.material_family != f.material_family:
                continue
            if f.material_families is not None and l.material_family not in f.material_families:
                continue
            if f.status and l.status != f.status:
                continue
            if q and not (q in l.material_specification.lower() or q in l.city.lower()
                          or (l.description and q in l.description.lower())):
                continue
            out.append(self.s.listing_view(l))
        return sorted(out, key=lambda l: l.created_at, reverse=True)

    async def get(self, listing_id: str) -> Listing | None:
        l = self.s.listings.get(listing_id)
        return self.s.listing_view(l) if l else None

    async def create(self, data: dict) -> Listing:
        now = now_iso()
        listing = Listing.model_validate({
            **data, "id": str(uuid.uuid4()), "reserved_quantity": 0, "created_at": now, "updated_at": now,
        })
        async with self.s.lock:
            self.s.listings[listing.id] = listing
        return self.s.listing_view(listing)

    async def update(self, listing_id: str, changes: dict) -> Listing | None:
        async with self.s.lock:
            current = self.s.listings.get(listing_id)
            if not current:
                return None
            # Re-checked under the lock: stock may have been reserved since the service looked.
            total = changes.get("total_quantity", current.total_quantity)
            if total < current.reserved_quantity:
                raise AppError("INVALID_QUANTITY", f"Cannot reduce total quantity ({total}) below active reserved "
                                                   f"quantity ({current.reserved_quantity}).")
            updated = Listing.model_validate({**current.model_dump(), **changes, "updated_at": now_iso()})
            self.s.listings[listing_id] = updated
        return self.s.listing_view(updated)


class MemoryRequirementRepository:
    def __init__(self, store: InMemoryStore):
        self.s = store

    async def list(self, f: RequirementFilter) -> list[Requirement]:
        out = [
            self.s.requirement_view(r) for r in self.s.requirements.values()
            if (not f.organization_id or r.organization_id == f.organization_id)
            and (not f.material_family or r.material_family == f.material_family)
            and (not f.status or r.status == f.status)
        ]
        return sorted(out, key=lambda r: r.created_at, reverse=True)

    async def get(self, requirement_id: str) -> Requirement | None:
        r = self.s.requirements.get(requirement_id)
        return self.s.requirement_view(r) if r else None

    async def create(self, data: dict) -> Requirement:
        req = Requirement.model_validate({**data, "id": str(uuid.uuid4()), "created_at": now_iso()})
        async with self.s.lock:
            self.s.requirements[req.id] = req
        return self.s.requirement_view(req)

    async def update(self, requirement_id: str, changes: dict) -> Requirement | None:
        async with self.s.lock:
            current = self.s.requirements.get(requirement_id)
            if not current:
                return None
            updated = Requirement.model_validate({**current.model_dump(), **changes})
            self.s.requirements[requirement_id] = updated
        return self.s.requirement_view(updated)

    async def exchange_statistics(self, requirement_ids: list[str]) -> ExchangeStatistics:
        wanted = set(requirement_ids)
        pending = sorted({e.requirement_id for e in self.s.exchanges.values()
                          if e.status == "PROPOSED" and e.requirement_id in wanted})
        fulfilled: dict[str, int] = {}
        for item in self.s.items.values():
            ex = self.s.exchanges.get(item.exchange_id)
            if (item.status == "COMPLETED" and ex and ex.requirement_id in wanted
                    and ex.status in ("IN_PROGRESS", "COMPLETED")):
                fulfilled[ex.requirement_id] = fulfilled.get(ex.requirement_id, 0) + item.quantity
        return ExchangeStatistics(pending, fulfilled)


class MemoryExchangeRepository:
    def __init__(self, store: InMemoryStore):
        self.s = store

    def _view(self, exchange_id: str) -> ExchangeView:
        s = self.s
        ex = s.exchanges[exchange_id]
        items = [i for i in s.items.values() if i.exchange_id == exchange_id]
        return build_view(
            ex,
            items,
            [l for l in s.logs if l.exchange_id == exchange_id],
            {i.listing_id: s.listing_view(s.listings[i.listing_id]) for i in items if i.listing_id in s.listings},
            s.requirements,
            s.organizations,
        ).model_copy(deep=True)

    async def list(self, f: ExchangeFilter) -> list[ExchangeView]:
        out = []
        for ex in sorted(self.s.exchanges.values(), key=lambda e: e.created_at, reverse=True):
            if f.status and ex.status != f.status:
                continue
            view = self._view(ex.id)
            org = f.organization_id
            if org and view.buyer_organization_id != org and not any(
                i.supplier_organization_id == org for i in view.items
            ):
                continue
            out.append(view)
        return out

    async def get(self, exchange_id: str) -> ExchangeView | None:
        return self._view(exchange_id) if exchange_id in self.s.exchanges else None

    async def create(self, requirement_id: str, buyer_id: str, items: list[NewExchangeItem]) -> str:
        async with self.s.lock:
            return workflow.create_exchange_request(self.s, requirement_id, buyer_id, items)

    async def create_listing_order(self, listing_id: str, quantity: int, buyer_id: str) -> str:
        async with self.s.lock:
            return workflow.create_listing_order(self.s, listing_id, quantity, buyer_id)

    async def act(self, action: ExchangeActionName, exchange_id: str, actor_id: str, item_id: str | None) -> None:
        async with self.s.lock:
            if action == "accept":
                workflow.accept_item(self.s, exchange_id, item_id or "", actor_id)
            elif action == "reject":
                workflow.reject_item(self.s, exchange_id, item_id or "", actor_id)
            elif action == "complete":
                workflow.complete_exchange(self.s, exchange_id, actor_id)
            else:
                workflow.cancel_exchange(self.s, exchange_id, actor_id)


class MemoryChatRepository:
    def __init__(self, store: InMemoryStore):
        self.s = store

    async def open_conversation(self, listing_id: str, buyer_id: str) -> str:
        async with self.s.lock:
            return chat.open_conversation(self.s, listing_id, buyer_id)

    async def get_conversation(self, conversation_id: str) -> ConversationRecord | None:
        conv = self.s.conversations.get(conversation_id)
        return conv.model_copy() if conv else None

    async def list_conversations(self, organization_id: str) -> list[ConversationRecord]:
        convs = [c.model_copy() for c in self.s.conversations.values()
                 if organization_id in (c.buyer_organization_id, c.supplier_organization_id)]
        return sorted(convs, key=lambda c: c.last_message_at, reverse=True)

    async def messages(self, conversation_id: str, after_seq: int, limit: int) -> list[ChatMessage]:
        out = [m for m in self.s.chat_messages if m.conversation_id == conversation_id and m.seq > after_seq]
        return [m.model_copy() for m in out[:limit]]

    async def post_message(self, conversation_id: str, actor_id: str, body: str) -> str:
        async with self.s.lock:
            return chat.post_message(self.s, conversation_id, actor_id, body)

    async def mark_read(self, conversation_id: str, actor_id: str) -> None:
        async with self.s.lock:
            chat.mark_read(self.s, conversation_id, actor_id)

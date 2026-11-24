"""Buyer ↔ supplier chat about a listing (Member 1).

The write rules (who may open a chat, participants only, unread counters) are atomic in the
repository (PL/pgSQL in migration 00007, mirrored in memory). This service adds participant
checks for reads and assembles the read models. It never touches orders, prices or stock:
ordering is the direct listing order flow (ExchangeService.request_listing).
"""

from __future__ import annotations

import asyncio

from app.core.errors import AppError
from app.repositories.base import Repositories
from app.schemas.chat import ConversationRecord, ConversationSummary, ConversationView
from app.schemas.entities import Listing, Organization

MESSAGE_PAGE = 200


class ChatService:
    def __init__(self, repos: Repositories):
        self.repos = repos

    async def _conversation(self, conversation_id: str, actor_id: str) -> ConversationRecord:
        conv = await self.repos.chat.get_conversation(conversation_id)
        if not conv:
            raise AppError("NOT_FOUND", f"Conversation {conversation_id} was not found.")
        if actor_id not in (conv.buyer_organization_id, conv.supplier_organization_id):
            raise AppError("FORBIDDEN_ORGANIZATION", "Only the buyer and the supplier can access this conversation.")
        return conv

    @staticmethod
    def _summary(conv: ConversationRecord, actor_id: str, listing: Listing | None,
                 orgs: dict[str, Organization]) -> ConversationSummary:
        is_buyer = actor_id == conv.buyer_organization_id
        buyer, supplier = orgs.get(conv.buyer_organization_id), orgs.get(conv.supplier_organization_id)
        return ConversationSummary(
            id=conv.id,
            role="BUYER" if is_buyer else "SUPPLIER",
            listing=listing.model_copy(update={"organization": None}) if listing else None,
            buyer=buyer,
            supplier=supplier,
            counterpart=supplier if is_buyer else buyer,
            last_message_at=conv.last_message_at,
            last_message_preview=conv.last_message_preview,
            unread=conv.buyer_unread if is_buyer else conv.supplier_unread,
            created_at=conv.created_at,
        )

    async def list(self, actor_id: str) -> tuple[list[ConversationSummary], int]:
        convs = await self.repos.chat.list_conversations(actor_id)
        if not convs:
            return [], 0
        listing_ids = sorted({c.listing_id for c in convs})
        listings, orgs = await asyncio.gather(
            asyncio.gather(*(self.repos.listings.get(i) for i in listing_ids)),
            self.repos.organizations.list(),
        )
        by_listing = {l.id: l for l in listings if l}
        by_org = {o.id: o for o in orgs}
        items = [self._summary(c, actor_id, by_listing.get(c.listing_id), by_org) for c in convs]
        return items, sum(i.unread for i in items)

    async def view(self, conversation_id: str, actor_id: str, after_seq: int = 0) -> ConversationView:
        conv = await self._conversation(conversation_id, actor_id)
        after = max(0, after_seq)
        listing, buyer, supplier, messages = await asyncio.gather(
            self.repos.listings.get(conv.listing_id),
            self.repos.organizations.get(conv.buyer_organization_id),
            self.repos.organizations.get(conv.supplier_organization_id),
            self.repos.chat.messages(conv.id, after, MESSAGE_PAGE),
        )
        orgs = {o.id: o for o in (buyer, supplier) if o}
        summary = self._summary(conv, actor_id, listing, orgs)
        return ConversationView(**summary.model_dump(), messages=messages,
                                last_seq=max([m.seq for m in messages], default=after))

    async def open(self, listing_id: str, buyer_id: str) -> ConversationView:
        return await self.view(await self.repos.chat.open_conversation(listing_id, buyer_id), buyer_id)

    async def send(self, conversation_id: str, actor_id: str, body: str, after_seq: int) -> ConversationView:
        await self.repos.chat.post_message(conversation_id, actor_id, body)
        return await self.view(conversation_id, actor_id, after_seq)

    async def mark_read(self, conversation_id: str, actor_id: str) -> None:
        await self.repos.chat.mark_read(conversation_id, actor_id)

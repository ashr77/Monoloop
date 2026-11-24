"""Buyer ↔ supplier chat about a listing (Member 1). Messages only: ordering is the direct
listing order flow (migration 00006). Records mirror supabase/migrations/00008_listing_chat.sql;
views match frontend/src/features/chat/types.ts.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import Entity
from app.schemas.entities import Int, IsoTime, Listing, Organization

ChatRole = Literal["BUYER", "SUPPLIER"]


class ConversationRecord(Entity):
    id: str
    listing_id: str
    buyer_organization_id: str
    supplier_organization_id: str
    last_message_at: IsoTime = ""
    last_message_preview: str = ""
    buyer_unread: Int = 0
    supplier_unread: Int = 0
    created_at: IsoTime = ""


class ChatMessage(Entity):
    id: str
    seq: Int
    conversation_id: str
    sender_organization_id: str
    body: str
    created_at: IsoTime = ""


class ConversationSummary(BaseModel):
    id: str
    role: ChatRole  # the acting organization's side
    listing: Listing | None
    buyer: Organization | None
    supplier: Organization | None
    counterpart: Organization | None
    last_message_at: str
    last_message_preview: str
    unread: int
    created_at: str


class ConversationView(ConversationSummary):
    messages: list[ChatMessage]  # only those with seq > ?after_seq
    last_seq: int

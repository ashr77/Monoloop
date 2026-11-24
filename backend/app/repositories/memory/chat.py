"""Chat rules for the in-memory store. Mirrors supabase/migrations/00008_listing_chat.sql rule for
rule. Callers hold the store lock; each operation validates first, then mutates."""

from __future__ import annotations

import uuid

from app.core.errors import AppError
from app.repositories.memory.store import InMemoryStore
from app.schemas.chat import ChatMessage, ConversationRecord
from app.schemas.entities import now_iso


def require_participant(s: InMemoryStore, conversation_id: str, actor_id: str) -> ConversationRecord:
    conv = s.conversations.get(conversation_id)
    if not conv:
        raise AppError("NOT_FOUND", f"Conversation {conversation_id} was not found.")
    if actor_id not in (conv.buyer_organization_id, conv.supplier_organization_id):
        raise AppError("FORBIDDEN_ORGANIZATION", "Only the buyer and the supplier can access this conversation.")
    return conv


def open_conversation(s: InMemoryStore, listing_id: str, buyer_id: str) -> str:
    for conv in s.conversations.values():
        if conv.listing_id == listing_id and conv.buyer_organization_id == buyer_id:
            return conv.id  # reopening an existing chat is always allowed
    listing = s.listings.get(listing_id)
    if not listing:
        raise AppError("NOT_FOUND", f"Listing {listing_id} was not found.")
    buyer = s.organizations.get(buyer_id)
    if not buyer:
        raise AppError("NOT_FOUND", f"Organization {buyer_id} was not found.")
    if buyer.organization_type not in ("BUYER", "HYBRID"):
        raise AppError("FORBIDDEN_ROLE", "Only buyer organizations can start a chat with a supplier.")
    if listing.organization_id == buyer_id:
        raise AppError("VALIDATION_ERROR", "You cannot start a chat about your own listing.")
    if listing.status != "ACTIVE":
        raise AppError("LISTING_UNAVAILABLE", f"Listing is {listing.status}, not ACTIVE.")
    now = now_iso()
    conv = ConversationRecord(id=str(uuid.uuid4()), listing_id=listing.id, buyer_organization_id=buyer_id,
                              supplier_organization_id=listing.organization_id, last_message_at=now, created_at=now)
    s.conversations[conv.id] = conv
    return conv.id


def post_message(s: InMemoryStore, conversation_id: str, actor_id: str, body: str) -> str:
    conv = require_participant(s, conversation_id, actor_id)
    text = (body or "").strip()
    if not text:
        raise AppError("VALIDATION_ERROR", "Message cannot be empty.")
    s.chat_seq += 1
    msg = ChatMessage(id=str(uuid.uuid4()), seq=s.chat_seq, conversation_id=conv.id,
                      sender_organization_id=actor_id, body=text, created_at=now_iso())
    s.chat_messages.append(msg)
    conv.last_message_at = msg.created_at
    conv.last_message_preview = text[:140]
    if actor_id != conv.buyer_organization_id:
        conv.buyer_unread += 1
    if actor_id != conv.supplier_organization_id:
        conv.supplier_unread += 1
    return msg.id


def mark_read(s: InMemoryStore, conversation_id: str, actor_id: str) -> None:
    conv = require_participant(s, conversation_id, actor_id)
    if actor_id == conv.buyer_organization_id:
        conv.buyer_unread = 0
    else:
        conv.supplier_unread = 0

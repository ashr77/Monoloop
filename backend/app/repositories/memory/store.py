"""In-process data store for demo mode and tests.

One store holds every table so cross-module operations (an exchange reserving listing stock and
fulfilling a requirement) stay consistent. All writes run under one asyncio.Lock and validate
before mutating, the in-memory equivalent of a single database transaction.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.schemas.chat import ChatMessage, ConversationRecord
from app.schemas.entities import (
    ActivityLog,
    ExchangeItemRecord,
    ExchangeRecord,
    Listing,
    Organization,
    Requirement,
)

SEED_FILE = Path(__file__).resolve().parents[2] / "seed" / "seed_data.json"


class InMemoryStore:
    def __init__(self, seed_file: Path = SEED_FILE):
        self._seed_file = seed_file
        self.lock = asyncio.Lock()
        self.reset()

    def reset(self) -> None:
        seed = json.loads(self._seed_file.read_text(encoding="utf-8"))
        self.organizations: dict[str, Organization] = {
            o["id"]: Organization.model_validate(o) for o in seed["organizations"]
        }
        self.listings: dict[str, Listing] = {
            l["id"]: Listing.model_validate({**l, "organization": None}) for l in seed["listings"]
        }
        self.requirements: dict[str, Requirement] = {
            r["id"]: Requirement.model_validate({**r, "organization": None}) for r in seed["requirements"]
        }
        self.exchanges: dict[str, ExchangeRecord] = {}
        self.items: dict[str, ExchangeItemRecord] = {}
        self.logs: list[ActivityLog] = []
        # Buyer ↔ supplier chat (migration 00007)
        self.conversations: dict[str, ConversationRecord] = {}
        self.chat_messages: list[ChatMessage] = []
        self.chat_seq = 0

    # Read helpers return copies so callers can never mutate the store through a result.
    def listing_view(self, listing: Listing) -> Listing:
        out = listing.model_copy(deep=True)
        out.available_quantity = out.total_quantity - out.reserved_quantity
        out.organization = self.organizations.get(out.organization_id)
        return out

    def requirement_view(self, requirement: Requirement) -> Requirement:
        out = requirement.model_copy(deep=True)
        out.organization = self.organizations.get(out.organization_id)
        return out

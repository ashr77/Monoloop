"""Supabase REST (PostgREST) implementations of the repository interfaces.

For when the database password is not available: the backend talks to Supabase over HTTPS
with the service-role key instead of a direct Postgres connection.

Design notes
- The service-role key lives only in backend/.env; the browser never sees it (same trust
  boundary as DATABASE_URL).
- Exchange state changes call the same PL/pgSQL functions from migration 00004 via /rpc.
  Each RPC call runs as ONE database transaction, so reservations stay atomic with row locks
  exactly as in the Postgres implementation (no over-allocation, no partial updates).
- Every filter value goes through httpx query encoding; free-text search is reduced to a
  safe character set before it reaches a PostgREST `or=` expression.
- Embeds name the foreign key explicitly (`organizations!listings_organization_id_fkey`)
  because exchange_items / exchanges also join those tables and PostgREST could otherwise
  report an ambiguous relationship.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from app.core.errors import ERROR_STATUS, AppError
from app.repositories.base import (
    ExchangeActionName,
    ExchangeFilter,
    ExchangeStatistics,
    ListingFilter,
    NewExchangeItem,
    RequirementFilter,
)
from app.schemas.chat import ChatMessage, ConversationRecord
from app.schemas.entities import (
    ActivityLog,
    ExchangeItemRecord,
    ExchangeRecord,
    Listing,
    Organization,
    Requirement,
    is_uuid,
)
from app.schemas.exchange import ExchangeView, build_view

LISTING_SELECT = "*,organization:organizations!listings_organization_id_fkey(*)"
REQUIREMENT_SELECT = "*,organization:organizations!requirements_organization_id_fkey(*)"
RETURN_ROWS = {"Prefer": "return=representation"}
logger = logging.getLogger("monoloop.supabase")

_DB_ERROR = re.compile(r"MONOLOOP:([A-Z_]+):(.*)", re.S)
# PostgREST / Postgres codes for "function / table / column does not exist".
_SCHEMA_MISSING = {"PGRST202", "PGRST205", "PGRST204", "42883", "42P01", "42703"}
logger = logging.getLogger("monoloop.db")
_SEARCH_UNSAFE = re.compile(r"[^\w\s.\-]", re.UNICODE)


def create_rest_client(url: str, service_role_key: str, timeout: float = 10.0) -> httpx.AsyncClient:
    """One pooled HTTP client for the whole app (keep-alive keeps each call fast)."""
    return httpx.AsyncClient(
        base_url=url.rstrip("/") + "/rest/v1",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=timeout,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    )


def translate_rest_error(response: httpx.Response) -> AppError:
    """Map PostgREST errors (incl. PL/pgSQL 'MONOLOOP:<CODE>:<message>') to AppError."""
    try:
        body = response.json()
    except ValueError:
        body = {}
    message = str(body.get("message") or "")
    m = _DB_ERROR.search(message)
    if m and m.group(1) in ERROR_STATUS:
        return AppError(m.group(1), m.group(2).strip().splitlines()[0])
    code = body.get("code")
    if code == "23505":
        return AppError("DUPLICATE_EXCHANGE", "An active exchange already exists for this requirement.")
    if code == "23514":
        return AppError("INSUFFICIENT_STOCK", "Inventory constraint rejected the change.")
    if code in _SCHEMA_MISSING:
        # A function, table or column the code expects does not exist: a migration was not applied.
        # The details (object name) go to the server log only.
        logger.error("Supabase schema is out of date (%s): %s", code, message)
        return AppError("SERVICE_UNAVAILABLE", "The database is missing a migration. Apply every file in "
                                               "supabase/migrations in order, then try again.")
    if response.status_code in (401, 403):
        return AppError("SERVICE_UNAVAILABLE", "Database API rejected the backend credentials.")
    return AppError("INTERNAL_ERROR", "Database error.")


def safe_search_term(term: str) -> str:
    """Keep letters, digits, spaces, '.' and '-' so input cannot alter a PostgREST `or=` filter."""
    return " ".join(_SEARCH_UNSAFE.sub(" ", term).split())[:100]


def _in(values: list[str] | tuple[str, ...]) -> str:
    return "in.(" + ",".join(values) + ")"


class _Rest:
    """Thin request helper shared by the repositories."""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def _send(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = await self.client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            # Type only: some httpx errors quote header values, which contain the service-role key.
            logger.warning("Supabase REST %s %s failed: %s", method, path, type(exc).__name__)
            raise AppError("SERVICE_UNAVAILABLE", f"Database API is unreachable ({type(exc).__name__}).") from exc
        if response.status_code >= 400:
            raise translate_rest_error(response)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def get(self, table: str, params: dict[str, str]) -> list[dict]:
        return await self._send("GET", f"/{table}", params=params) or []

    async def insert(self, table: str, row: dict, select: str = "*") -> dict:
        rows = await self._send("POST", f"/{table}", params={"select": select}, json=row, headers=RETURN_ROWS)
        return rows[0]

    async def patch(self, table: str, params: dict[str, str], changes: dict, select: str = "*") -> list[dict]:
        return await self._send("PATCH", f"/{table}", params={**params, "select": select},
                                json=changes, headers=RETURN_ROWS) or []

    async def rpc(self, function: str, args: dict) -> Any:
        return await self._send("POST", f"/rpc/{function}", json=args)


class SupabaseOrganizationRepository:
    def __init__(self, client: httpx.AsyncClient):
        self.rest = _Rest(client)

    async def list(self) -> list[Organization]:
        rows = await self.rest.get("organizations", {"select": "*", "order": "name.asc"})
        return [Organization.model_validate(r) for r in rows]

    async def get(self, organization_id: str) -> Organization | None:
        if not is_uuid(organization_id):
            return None
        rows = await self.rest.get("organizations", {"select": "*", "id": f"eq.{organization_id}"})
        return Organization.model_validate(rows[0]) if rows else None


class SupabaseListingRepository:
    def __init__(self, client: httpx.AsyncClient):
        self.rest = _Rest(client)

    async def list(self, f: ListingFilter) -> list[Listing]:
        params: dict[str, str] = {"select": LISTING_SELECT, "order": "created_at.desc"}
        if f.organization_id:
            if not is_uuid(f.organization_id):
                return []
            params["organization_id"] = f"eq.{f.organization_id}"
        if f.material_family:
            params["material_family"] = f"eq.{f.material_family}"
        if f.material_families is not None:
            if not f.material_families:
                return []
            params["material_family"] = _in(f.material_families)
        if f.status:
            params["status"] = f"eq.{f.status}"
        if f.search:
            term = safe_search_term(f.search)
            if term:
                pattern = f'"*{term}*"'
                params["or"] = (f"(description.ilike.{pattern},material_specification.ilike.{pattern},"
                                f"city.ilike.{pattern})")
        return [Listing.model_validate(r) for r in await self.rest.get("listings", params)]

    async def get(self, listing_id: str) -> Listing | None:
        if not is_uuid(listing_id):
            return None
        rows = await self.rest.get("listings", {"select": LISTING_SELECT, "id": f"eq.{listing_id}"})
        return Listing.model_validate(rows[0]) if rows else None

    async def create(self, data: dict) -> Listing:
        # id comes from the database default; reserved_quantity always starts at 0.
        row = {k: v for k, v in data.items() if k not in ("id", "available_quantity", "organization")}
        row["reserved_quantity"] = 0
        return Listing.model_validate(await self.rest.insert("listings", row))

    async def update(self, listing_id: str, changes: dict) -> Listing | None:
        if not is_uuid(listing_id):
            return None
        params = {"id": f"eq.{listing_id}"}
        if "total_quantity" in changes:
            # Atomic guard in the same UPDATE: never drop total below what is reserved.
            params["reserved_quantity"] = f"lte.{int(changes['total_quantity'])}"
        try:
            rows = await self.rest.patch("listings", params, changes)
        except AppError as exc:
            if exc.code == "INSUFFICIENT_STOCK":  # check constraint
                raise AppError("INVALID_QUANTITY", "Total quantity cannot be lower than reserved quantity.") from exc
            raise
        if not rows:
            existing = await self.get(listing_id)
            if existing is None:
                return None
            raise AppError("INVALID_QUANTITY", f"Cannot reduce total quantity ({changes['total_quantity']}) below "
                                               f"active reserved quantity ({existing.reserved_quantity}).")
        return Listing.model_validate(rows[0])


class SupabaseRequirementRepository:
    def __init__(self, client: httpx.AsyncClient):
        self.rest = _Rest(client)

    async def list(self, f: RequirementFilter) -> list[Requirement]:
        params: dict[str, str] = {"select": REQUIREMENT_SELECT, "order": "created_at.desc"}
        if f.organization_id:
            if not is_uuid(f.organization_id):
                return []
            params["organization_id"] = f"eq.{f.organization_id}"
        if f.material_family:
            params["material_family"] = f"eq.{f.material_family}"
        if f.status:
            params["status"] = f"eq.{f.status}"
        return [Requirement.model_validate(r) for r in await self.rest.get("requirements", params)]

    async def get(self, requirement_id: str) -> Requirement | None:
        if not is_uuid(requirement_id):
            return None
        rows = await self.rest.get("requirements", {"select": REQUIREMENT_SELECT, "id": f"eq.{requirement_id}"})
        return Requirement.model_validate(rows[0]) if rows else None

    async def create(self, data: dict) -> Requirement:
        row = {k: v for k, v in data.items() if k not in ("id", "organization")}
        return Requirement.model_validate(await self.rest.insert("requirements", row))

    async def update(self, requirement_id: str, changes: dict) -> Requirement | None:
        if not is_uuid(requirement_id):
            return None
        rows = await self.rest.patch("requirements", {"id": f"eq.{requirement_id}"}, changes)
        return Requirement.model_validate(rows[0]) if rows else None

    async def exchange_statistics(self, requirement_ids: list[str]) -> ExchangeStatistics:
        ids = [i for i in requirement_ids if is_uuid(i)]
        if not ids:
            return ExchangeStatistics()
        exchanges = await self.rest.get("exchanges", {
            "select": "id,requirement_id,status",
            "requirement_id": _in(ids),
            "status": _in(("PROPOSED", "IN_PROGRESS", "COMPLETED")),
        })
        pending = sorted({e["requirement_id"] for e in exchanges if e["status"] == "PROPOSED"})
        counted = {e["id"]: e["requirement_id"] for e in exchanges if e["status"] in ("IN_PROGRESS", "COMPLETED")}
        fulfilled: dict[str, int] = {}
        if counted:
            items = await self.rest.get("exchange_items", {
                "select": "exchange_id,quantity",
                "exchange_id": _in(list(counted)),
                "status": "eq.COMPLETED",
            })
            for item in items:
                req = counted[item["exchange_id"]]
                fulfilled[req] = fulfilled.get(req, 0) + int(item["quantity"])
        return ExchangeStatistics(pending, fulfilled)


class SupabaseExchangeRepository:
    def __init__(self, client: httpx.AsyncClient):
        self.rest = _Rest(client)

    async def _views(self, exchange_id: str | None = None, f: ExchangeFilter | None = None) -> list[ExchangeView]:
        f = f or ExchangeFilter()
        params: dict[str, str] = {"select": "*", "order": "created_at.desc"}
        if exchange_id:
            params["id"] = f"eq.{exchange_id}"
        if f.status:
            params["status"] = f"eq.{f.status}"
        if f.organization_id:
            if not is_uuid(f.organization_id):
                return []
            supplied = await self.rest.get("exchange_items", {
                "select": "exchange_id", "supplier_organization_id": f"eq.{f.organization_id}",
            })
            ids = sorted({s["exchange_id"] for s in supplied})
            clauses = [f"buyer_organization_id.eq.{f.organization_id}"] + ([f"id.{_in(ids)}"] if ids else [])
            params["or"] = "(" + ",".join(clauses) + ")"

        exchanges = [ExchangeRecord.model_validate(e) for e in await self.rest.get("exchanges", params)]
        if not exchanges:
            return []
        ex_ids = [e.id for e in exchanges]

        item_rows, log_rows = await asyncio.gather(
            self.rest.get("exchange_items", {"select": "*", "exchange_id": _in(ex_ids)}),
            self.rest.get("activity_logs", {"select": "*", "exchange_id": _in(ex_ids)}),
        )
        items = [ExchangeItemRecord.model_validate(i) for i in item_rows]
        logs = [ActivityLog.model_validate(a) for a in log_rows]

        listing_ids = sorted({i.listing_id for i in items})
        req_ids = sorted({e.requirement_id for e in exchanges if e.requirement_id})
        org_ids = sorted({e.buyer_organization_id for e in exchanges} | {i.supplier_organization_id for i in items})

        async def fetch(table: str, ids: list[str]) -> list[dict]:
            return await self.rest.get(table, {"select": "*", "id": _in(ids)}) if ids else []

        listing_rows, req_rows, org_rows = await asyncio.gather(
            fetch("listings", listing_ids), fetch("requirements", req_ids), fetch("organizations", org_ids),
        )
        lst = {r["id"]: Listing.model_validate(r) for r in listing_rows}
        reqs = {r["id"]: Requirement.model_validate(r) for r in req_rows}
        orgs = {r["id"]: Organization.model_validate(r) for r in org_rows}

        by_ex: dict[str, list[ExchangeItemRecord]] = {}
        for i in items:
            by_ex.setdefault(i.exchange_id, []).append(i)
        logs_by_ex: dict[str, list[ActivityLog]] = {}
        for a in logs:
            logs_by_ex.setdefault(a.exchange_id or "", []).append(a)
        return [build_view(e, by_ex.get(e.id, []), logs_by_ex.get(e.id, []), lst, reqs, orgs) for e in exchanges]

    async def list(self, f: ExchangeFilter) -> list[ExchangeView]:
        return await self._views(None, f)

    async def get(self, exchange_id: str) -> ExchangeView | None:
        if not is_uuid(exchange_id):
            return None
        views = await self._views(exchange_id)
        return views[0] if views else None

    async def create(self, requirement_id: str, buyer_id: str, items: list[NewExchangeItem]) -> str:
        payload = [{"listing_id": i.listing_id, "quantity": i.quantity} for i in items]
        result = await self.rest.rpc("create_exchange_request", {
            "p_requirement_id": requirement_id, "p_buyer_id": buyer_id, "p_items": payload,
        })
        return str(result)

    async def create_listing_order(self, listing_id: str, quantity: int, buyer_id: str) -> str:
        result = await self.rest.rpc("create_direct_listing_order", {
            "p_listing_id": listing_id,
            "p_buyer_id": buyer_id,
            "p_quantity": quantity,
        })
        # The function returns a uuid; PostgREST sends it as a JSON string.
        return str(result)

    async def act(self, action: ExchangeActionName, exchange_id: str, actor_id: str, item_id: str | None) -> None:
        if not is_uuid(exchange_id):
            raise AppError("NOT_FOUND", f"Exchange {exchange_id} was not found.")
        if action in ("accept", "reject"):
            if not is_uuid(item_id):
                raise AppError("NOT_FOUND", f"Exchange item {item_id} was not found in exchange {exchange_id}.")
            belongs = await self.rest.get("exchange_items", {
                "select": "id", "id": f"eq.{item_id}", "exchange_id": f"eq.{exchange_id}",
            })
            if not belongs:
                raise AppError("NOT_FOUND", f"Exchange item {item_id} was not found in exchange {exchange_id}.")
            fn = "accept_exchange_item" if action == "accept" else "reject_exchange_item"
            await self.rest.rpc(fn, {"p_item_id": item_id, "p_actor_id": actor_id})
        else:
            fn = "complete_exchange" if action == "complete" else "cancel_exchange"
            await self.rest.rpc(fn, {"p_exchange_id": exchange_id, "p_actor_id": actor_id})


class SupabaseChatRepository:
    """Buyer ↔ supplier chat over PostgREST. Writes are single /rpc calls to the migration-00008
    functions (one transaction each); reads filter by participant and the polling cursor."""

    def __init__(self, client: httpx.AsyncClient):
        self.rest = _Rest(client)

    @staticmethod
    def _require_uuid(value: str, what: str) -> None:
        if not is_uuid(value):
            raise AppError("NOT_FOUND", f"{what} {value} was not found.")

    async def open_conversation(self, listing_id: str, buyer_id: str) -> str:
        self._require_uuid(listing_id, "Listing")
        return str(await self.rest.rpc("open_listing_conversation", {"p_listing_id": listing_id, "p_buyer_id": buyer_id}))

    async def get_conversation(self, conversation_id: str) -> ConversationRecord | None:
        if not is_uuid(conversation_id):
            return None
        rows = await self.rest.get("listing_conversations", {"select": "*", "id": f"eq.{conversation_id}"})
        return ConversationRecord.model_validate(rows[0]) if rows else None

    async def list_conversations(self, organization_id: str) -> list[ConversationRecord]:
        if not is_uuid(organization_id):
            return []
        rows = await self.rest.get("listing_conversations", {
            "select": "*",
            "or": f"(buyer_organization_id.eq.{organization_id},supplier_organization_id.eq.{organization_id})",
            "order": "last_message_at.desc",
            "limit": "200",
        })
        return [ConversationRecord.model_validate(r) for r in rows]

    async def messages(self, conversation_id: str, after_seq: int, limit: int) -> list[ChatMessage]:
        if not is_uuid(conversation_id):
            return []
        rows = await self.rest.get("listing_messages", {
            "select": "*", "conversation_id": f"eq.{conversation_id}", "seq": f"gt.{int(after_seq)}",
            "order": "seq.asc", "limit": str(int(limit)),
        })
        return [ChatMessage.model_validate(r) for r in rows]

    async def post_message(self, conversation_id: str, actor_id: str, body: str) -> str:
        self._require_uuid(conversation_id, "Conversation")
        return str(await self.rest.rpc("post_listing_message", {
            "p_conversation_id": conversation_id, "p_actor_id": actor_id, "p_body": body,
        }))

    async def mark_read(self, conversation_id: str, actor_id: str) -> None:
        self._require_uuid(conversation_id, "Conversation")
        await self.rest.rpc("mark_listing_conversation_read", {"p_conversation_id": conversation_id, "p_actor_id": actor_id})

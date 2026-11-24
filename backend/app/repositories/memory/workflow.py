"""Exchange state machine for the in-memory store.

Mirrors the PL/pgSQL functions in supabase/migrations/00004_exchange_workflow.sql rule for rule.
Callers hold the store lock; every operation validates everything first and only then mutates,
so a failed call leaves the store untouched (the equivalent of a rolled-back transaction).

    exchange: PROPOSED ──(every item ACCEPTED)──▶ IN_PROGRESS ──▶ COMPLETED
                 └──────────────── cancel ─────────────┴──▶ CANCELLED
    item:     PENDING ──accept──▶ ACCEPTED ──complete──▶ COMPLETED
                 └──reject──▶ REJECTED     └──cancel──▶ CANCELLED (stock released)
"""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import AppError
from app.repositories.base import NewExchangeItem
from app.repositories.memory.store import InMemoryStore
from app.schemas.entities import ActivityLog, ExchangeItemRecord, ExchangeRecord, Listing, now_iso


def _log(s: InMemoryStore, exchange_id: str, action: str, details: dict[str, Any]) -> None:
    s.logs.append(ActivityLog(id=str(uuid.uuid4()), exchange_id=exchange_id, action=action,
                              details=details, created_at=now_iso()))


def _exchange(s: InMemoryStore, exchange_id: str) -> ExchangeRecord:
    ex = s.exchanges.get(exchange_id)
    if not ex:
        raise AppError("NOT_FOUND", f"Exchange {exchange_id} was not found.")
    return ex


def _item(s: InMemoryStore, exchange_id: str, item_id: str) -> ExchangeItemRecord:
    item = s.items.get(item_id)
    if not item or item.exchange_id != exchange_id:
        raise AppError("NOT_FOUND", f"Exchange item {item_id} was not found in exchange {exchange_id}.")
    return item


def _listing(s: InMemoryStore, listing_id: str) -> Listing:
    listing = s.listings.get(listing_id)
    if not listing:
        raise AppError("NOT_FOUND", f"Listing {listing_id} was not found.")
    return listing


def _set_quantities(listing: Listing, total: int, reserved: int) -> None:
    if reserved < 0 or total < 0 or reserved > total:  # same invariant as the table CHECK constraints
        raise AppError("INVALID_STATE", f"Inventory invariant violated for listing {listing.id}.")
    listing.total_quantity = total
    listing.reserved_quantity = reserved
    listing.available_quantity = total - reserved
    listing.updated_at = now_iso()


def _items_of(s: InMemoryStore, exchange_id: str) -> list[ExchangeItemRecord]:
    return [i for i in s.items.values() if i.exchange_id == exchange_id]


def create_exchange_request(s: InMemoryStore, requirement_id: str, buyer_id: str, items: list[NewExchangeItem]) -> str:
    req = s.requirements.get(requirement_id)
    if not req:
        raise AppError("NOT_FOUND", f"Requirement {requirement_id} was not found.")
    if req.organization_id != buyer_id:
        raise AppError("FORBIDDEN_ORGANIZATION",
                       "Only the organization that published this requirement can request an exchange for it.")
    if req.status != "OPEN":
        raise AppError("REQUIREMENT_NOT_OPEN", f"Requirement is {req.status}; only OPEN requirements can start an exchange.")
    if any(e.requirement_id == req.id and e.status in ("PROPOSED", "IN_PROGRESS") for e in s.exchanges.values()):
        raise AppError("DUPLICATE_EXCHANGE", "An active exchange already exists for this requirement.")
    if not items:
        raise AppError("NO_ALLOCATION", "An exchange needs at least one allocated listing.")

    seen: set[str] = set()
    resolved: list[tuple[Listing, int]] = []
    for it in items:
        if not isinstance(it.quantity, int) or it.quantity <= 0:
            raise AppError("VALIDATION_ERROR", "Allocated quantity must be a positive integer.")
        if it.listing_id in seen:
            raise AppError("VALIDATION_ERROR", f"Listing {it.listing_id} appears more than once.")
        seen.add(it.listing_id)
        listing = _listing(s, it.listing_id)
        if listing.status != "ACTIVE":
            raise AppError("LISTING_UNAVAILABLE", f"Listing {listing.id} is {listing.status}, not ACTIVE.")
        if listing.organization_id == buyer_id:
            raise AppError("VALIDATION_ERROR", "A buyer cannot request its own listing.")
        if (listing.material_family != req.material_family
                or listing.material_specification != req.material_specification):
            raise AppError("VALIDATION_ERROR", f"Listing {listing.id} does not match the requirement material.")
        resolved.append((listing, it.quantity))

    now = now_iso()
    ex = ExchangeRecord(id=str(uuid.uuid4()), requirement_id=req.id, buyer_organization_id=buyer_id,
                        status="PROPOSED", created_at=now, updated_at=now)
    s.exchanges[ex.id] = ex
    for listing, qty in resolved:
        item = ExchangeItemRecord(
            id=str(uuid.uuid4()), exchange_id=ex.id, listing_id=listing.id,
            supplier_organization_id=listing.organization_id, quantity=qty,
            unit_price_bdt=float(listing.unit_price_bdt), status="PENDING", created_at=now, updated_at=now,
        )
        s.items[item.id] = item
    _log(s, ex.id, "EXCHANGE_REQUESTED", {
        "actor_organization_id": buyer_id, "requirement_id": req.id,
        "item_count": len(resolved), "total_quantity": sum(q for _, q in resolved),
    })
    return ex.id


def create_listing_order(s: InMemoryStore, listing_id: str, quantity: int, buyer_id: str) -> str:
    listing = _listing(s, listing_id)
    if listing.status != "ACTIVE":
        raise AppError("LISTING_UNAVAILABLE", f"Listing is {listing.status} and cannot be ordered.")
    if listing.organization_id == buyer_id:
        raise AppError("VALIDATION_ERROR", "A buyer cannot order its own listing.")
    available = listing.total_quantity - listing.reserved_quantity
    if quantity <= 0:
        raise AppError("VALIDATION_ERROR", "Requested quantity must be a positive whole number.")
    if quantity > available:
        raise AppError(
            "INSUFFICIENT_STOCK",
            f"Only {available} piece(s) are still available.",
            {"available": available, "requested": quantity},
        )
    pending_quantity = sum(
        i.quantity
        for i in s.items.values()
        if i.listing_id == listing_id
        and i.status in ("PENDING", "ACCEPTED")
        and i.exchange_id in s.exchanges
        and s.exchanges[i.exchange_id].status in ("PROPOSED", "IN_PROGRESS")
    )
    if pending_quantity + quantity > available:
        raise AppError(
            "INSUFFICIENT_STOCK",
            f"Only {available - pending_quantity} piece(s) remain uncommitted.",
            {"available": available - pending_quantity, "requested": quantity},
        )
    if any(
        i.status == "PENDING"
        and i.listing_id == listing_id
        and s.exchanges[i.exchange_id].buyer_organization_id == buyer_id
        and s.exchanges[i.exchange_id].status == "PROPOSED"
        for i in s.items.values()
        if i.exchange_id in s.exchanges
    ):
        raise AppError("DUPLICATE_EXCHANGE", "An active order already exists for this listing.")

    now = now_iso()
    ex = ExchangeRecord(
        id=str(uuid.uuid4()),
        requirement_id=None,
        buyer_organization_id=buyer_id,
        status="PROPOSED",
        created_at=now,
        updated_at=now,
    )
    s.exchanges[ex.id] = ex
    item = ExchangeItemRecord(
        id=str(uuid.uuid4()),
        exchange_id=ex.id,
        listing_id=listing.id,
        supplier_organization_id=listing.organization_id,
        quantity=quantity,
        unit_price_bdt=float(listing.unit_price_bdt),
        status="PENDING",
        created_at=now,
        updated_at=now,
    )
    s.items[item.id] = item
    _log(s, ex.id, "DIRECT_LISTING_ORDER", {
        "actor_organization_id": buyer_id,
        "listing_id": listing_id,
        "quantity": quantity,
        "unit_price_bdt": listing.unit_price_bdt,
    })
    return ex.id


def accept_item(s: InMemoryStore, exchange_id: str, item_id: str, actor_id: str) -> None:
    ex, item = _exchange(s, exchange_id), _item(s, exchange_id, item_id)
    if item.supplier_organization_id != actor_id:
        raise AppError("FORBIDDEN_ORGANIZATION", "Only the supplier of this item can accept it.")
    if ex.status != "PROPOSED":
        raise AppError("INVALID_STATE", f"Exchange is {ex.status}; items can only be accepted while it is PROPOSED.")
    if item.status != "PENDING":
        raise AppError("INVALID_STATE", f"Item is already {item.status}.")
    listing = _listing(s, item.listing_id)
    if listing.status != "ACTIVE":
        raise AppError("LISTING_UNAVAILABLE", f"Listing is {listing.status} and cannot be reserved.")
    available = listing.total_quantity - listing.reserved_quantity
    if available < item.quantity:
        raise AppError(
            "INSUFFICIENT_STOCK",
            f"Only {available} piece(s) are still available; {item.quantity} requested. Stock changed since matching.",
            {"available": available, "requested": item.quantity},
        )

    _set_quantities(listing, listing.total_quantity, listing.reserved_quantity + item.quantity)
    item.status, item.updated_at = "ACCEPTED", now_iso()
    _log(s, ex.id, "ITEM_ACCEPTED", {"actor_organization_id": actor_id, "exchange_item_id": item.id,
                                     "listing_id": listing.id, "quantity": item.quantity})
    if all(i.status == "ACCEPTED" for i in _items_of(s, ex.id)):
        ex.status, ex.updated_at = "IN_PROGRESS", now_iso()
        _log(s, ex.id, "EXCHANGE_RESERVED", {"actor_organization_id": actor_id})


def reject_item(s: InMemoryStore, exchange_id: str, item_id: str, actor_id: str) -> None:
    ex, item = _exchange(s, exchange_id), _item(s, exchange_id, item_id)
    if item.supplier_organization_id != actor_id:
        raise AppError("FORBIDDEN_ORGANIZATION", "Only the supplier of this item can decline it.")
    if ex.status != "PROPOSED":
        raise AppError("INVALID_STATE", f"Exchange is {ex.status}; items can only be declined while it is PROPOSED.")
    if item.status != "PENDING":
        raise AppError("INVALID_STATE", f"Item is already {item.status}.")
    item.status, item.updated_at = "REJECTED", now_iso()
    _log(s, ex.id, "ITEM_REJECTED", {"actor_organization_id": actor_id, "exchange_item_id": item.id,
                                     "listing_id": item.listing_id, "quantity": item.quantity})


def complete_exchange(s: InMemoryStore, exchange_id: str, actor_id: str) -> None:
    ex = _exchange(s, exchange_id)
    if ex.buyer_organization_id != actor_id:
        raise AppError("FORBIDDEN_ORGANIZATION", "Only the buyer can confirm completion of this exchange.")
    if ex.status != "IN_PROGRESS":
        raise AppError("INVALID_STATE",
                       f"Exchange is {ex.status}; only a fully reserved (IN_PROGRESS) exchange can be completed.")

    plan: list[tuple[ExchangeItemRecord, Listing]] = []
    for item in sorted(_items_of(s, ex.id), key=lambda i: i.listing_id):
        if item.status != "ACCEPTED":
            raise AppError("INVALID_STATE", f"Item {item.id} is {item.status}, expected ACCEPTED.")
        listing = _listing(s, item.listing_id)
        if listing.reserved_quantity < item.quantity or listing.total_quantity < item.quantity:
            raise AppError("INVALID_STATE", f"Reservation for listing {listing.id} is inconsistent.")
        plan.append((item, listing))

    total_qty, total_value = 0, 0.0
    for item, listing in plan:
        _set_quantities(listing, listing.total_quantity - item.quantity, listing.reserved_quantity - item.quantity)
        if listing.total_quantity == 0:
            listing.status = "COMPLETED"
        item.status, item.updated_at = "COMPLETED", now_iso()
        total_qty += item.quantity
        total_value += item.quantity * item.unit_price_bdt
    ex.status, ex.updated_at = "COMPLETED", now_iso()

    if ex.requirement_id and (req := s.requirements.get(ex.requirement_id)):
        ids = {e.id for e in s.exchanges.values() if e.requirement_id == req.id}
        done = sum(i.quantity for i in s.items.values() if i.exchange_id in ids and i.status == "COMPLETED")
        if done >= req.required_quantity:
            req.status = "FULFILLED"
    _log(s, ex.id, "EXCHANGE_COMPLETED", {"actor_organization_id": actor_id, "total_quantity": total_qty,
                                          "total_value_bdt": total_value})


def cancel_exchange(s: InMemoryStore, exchange_id: str, actor_id: str) -> None:
    ex = _exchange(s, exchange_id)
    if ex.buyer_organization_id != actor_id:
        raise AppError("FORBIDDEN_ORGANIZATION", "Only the buyer can cancel this exchange.")
    if ex.status not in ("PROPOSED", "IN_PROGRESS"):
        raise AppError("INVALID_STATE", f"Exchange is already {ex.status}.")

    items = _items_of(s, ex.id)
    releases = []
    for item in items:
        if item.status == "ACCEPTED":
            listing = _listing(s, item.listing_id)
            if listing.reserved_quantity < item.quantity:
                raise AppError("INVALID_STATE", f"Reservation for listing {listing.id} is inconsistent.")
            releases.append((item, listing))

    released = 0
    for item, listing in releases:
        _set_quantities(listing, listing.total_quantity, listing.reserved_quantity - item.quantity)
        released += item.quantity
    for item in items:
        if item.status in ("PENDING", "ACCEPTED"):
            item.status, item.updated_at = "CANCELLED", now_iso()
    ex.status, ex.updated_at = "CANCELLED", now_iso()
    _log(s, ex.id, "EXCHANGE_CANCELLED", {"actor_organization_id": actor_id, "released_quantity": released})

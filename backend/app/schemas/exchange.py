"""Exchange read model (same shape as ExchangeView in frontend/src/features/exchanges/types.ts)
and the builder shared by both repository implementations."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.entities import (
    ActivityLog,
    ExchangeItemRecord,
    ExchangeRecord,
    Listing,
    Organization,
    Requirement,
)
from app.schemas.payment import PaymentSummary

ExchangeStage = Literal["AWAITING_SUPPLIERS", "SUPPLIER_DECLINED", "RESERVED", "COMPLETED", "CANCELLED"]


class ExchangeItemView(ExchangeItemRecord):
    subtotal_bdt: float
    listing: Listing | None = None
    supplier: Organization | None = None


class ExchangeCounts(BaseModel):
    pending: int = 0
    accepted: int = 0
    rejected: int = 0
    completed: int = 0
    cancelled: int = 0


class ExchangeView(ExchangeRecord):
    stage: ExchangeStage
    items: list[ExchangeItemView]
    buyer: Organization | None = None
    requirement: Requirement | None = None
    activity: list[ActivityLog]
    total_quantity: int
    total_value_bdt: float
    counts: ExchangeCounts
    # Filled by ExchangeService when online payment is enabled (Member 4, migration 00005).
    payment: PaymentSummary | None = None
    payment_required: bool = False


def derive_stage(status: str, item_statuses: list[str]) -> ExchangeStage:
    if status == "COMPLETED":
        return "COMPLETED"
    if status == "CANCELLED":
        return "CANCELLED"
    if status == "IN_PROGRESS":
        return "RESERVED"
    return "SUPPLIER_DECLINED" if "REJECTED" in item_statuses else "AWAITING_SUPPLIERS"


def build_view(
    exchange: ExchangeRecord,
    items: list[ExchangeItemRecord],
    logs: list[ActivityLog],
    listings: dict[str, Listing],
    requirements: dict[str, Requirement],
    organizations: dict[str, Organization],
) -> ExchangeView:
    views = []
    for i in items:
        listing = listings.get(i.listing_id)
        views.append(ExchangeItemView(
            **i.model_dump(),
            subtotal_bdt=i.quantity * i.unit_price_bdt,
            listing=listing.model_copy(update={"organization": None}) if listing else None,
            supplier=organizations.get(i.supplier_organization_id),
        ))
    # Largest contribution first; listing id as a stable tie-break.
    views.sort(key=lambda v: (-v.quantity, v.listing_id))

    counts = ExchangeCounts()
    for v in views:
        key = v.status.lower()
        setattr(counts, key, getattr(counts, key) + 1)

    requirement = requirements.get(exchange.requirement_id) if exchange.requirement_id else None
    return ExchangeView(
        **exchange.model_dump(),
        stage=derive_stage(exchange.status, [v.status for v in views]),
        items=views,
        buyer=organizations.get(exchange.buyer_organization_id),
        requirement=requirement.model_copy(update={"organization": None}) if requirement else None,
        activity=sorted(logs, key=lambda l: l.created_at),
        total_quantity=sum(v.quantity for v in views),
        total_value_bdt=sum(v.subtotal_bdt for v in views),
        counts=counts,
    )

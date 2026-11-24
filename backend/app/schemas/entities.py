"""Domain records shared by repositories, services and responses.

These mirror the frozen interfaces in frontend/src/lib/types.ts field for field.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, StringConstraints

from app.domain.constants import (
    ConditionRequirement,
    ExchangeItemStatus,
    ExchangeStatus,
    ListingStatus,
    MaterialCondition,
    MaterialFamily,
    OrganizationType,
    QuantityUnit,
    RequirementStatus,
)
from app.schemas.common import Entity

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
UUID_RE = re.compile(UUID_PATTERN)
UuidStr = Annotated[str, StringConstraints(pattern=UUID_PATTERN)]


def is_uuid(value: str | None) -> bool:
    return bool(value) and bool(UUID_RE.match(value))


def _iso(value: Any) -> Any:
    """Postgres returns datetimes; the in-memory store keeps ISO strings. Normalise to ISO-8601 'Z'."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return value


def _num(value: Any) -> Any:
    # NUMERIC columns arrive as Decimal; keep ints as ints so JSON stays clean.
    if value is None or isinstance(value, (int, float)):
        return value
    try:
        f = float(value)
    except (TypeError, ValueError):
        return value
    return int(f) if f.is_integer() else f


IsoTime = Annotated[str, BeforeValidator(_iso)]
Num = Annotated[float, BeforeValidator(_num)]
Int = Annotated[int, BeforeValidator(_num)]


def now_iso() -> str:
    return _iso(datetime.now(UTC))


OrganizationStatus = Literal["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]


class Organization(Entity):
    """Public view of a company: safe to show to anyone (no licence, email or login)."""

    id: str
    name: str
    organization_type: OrganizationType
    city: str
    address: str | None = None
    status: OrganizationStatus = "APPROVED"
    created_at: IsoTime = ""


class OrganizationRecord(Organization):
    """Full company record (migration 00009): only for the company itself and for admins."""

    license_number: str | None = None
    contact_email: str | None = None
    auth_user_id: str | None = None
    rejection_reason: str | None = None
    reviewed_at: IsoTime | None = None

    def public(self) -> Organization:
        return Organization.model_validate(self.model_dump(include=set(Organization.model_fields)))


class Listing(Entity):
    id: str
    organization_id: str
    material_family: MaterialFamily
    material_specification: str
    length_mm: Num
    width_mm: Num
    thickness_mm: Num
    total_quantity: Int
    reserved_quantity: Int = 0
    available_quantity: Int = 0
    quantity_unit: QuantityUnit = "PIECE"
    condition: MaterialCondition
    unit_price_bdt: Num
    description: str | None = None
    image_url: str | None = None
    city: str
    status: ListingStatus = "ACTIVE"
    created_at: IsoTime = ""
    updated_at: IsoTime = ""
    organization: Organization | None = None

    def model_post_init(self, _: Any) -> None:
        # Always derived, never trusted from storage or clients.
        self.available_quantity = self.total_quantity - self.reserved_quantity


class Requirement(Entity):
    id: str
    organization_id: str
    material_family: MaterialFamily
    material_specification: str
    length_mm: Num | None = None
    width_mm: Num | None = None
    thickness_mm: Num | None = None
    length_min_mm: Num | None = None
    length_max_mm: Num | None = None
    width_min_mm: Num | None = None
    width_max_mm: Num | None = None
    thickness_min_mm: Num | None = None
    thickness_max_mm: Num | None = None
    required_quantity: Int
    quantity_unit: QuantityUnit = "PIECE"
    maximum_budget_bdt: Num | None = None
    allow_split_suppliers: bool = True
    condition_requirement: ConditionRequirement = "ANY"
    status: RequirementStatus = "OPEN"
    created_at: IsoTime = ""
    organization: Organization | None = None


class ExchangeRecord(Entity):
    id: str
    requirement_id: str | None = None
    buyer_organization_id: str
    status: ExchangeStatus = "PROPOSED"
    created_at: IsoTime = ""
    updated_at: IsoTime = ""


class ExchangeItemRecord(Entity):
    id: str
    exchange_id: str
    listing_id: str
    supplier_organization_id: str
    quantity: Int
    unit_price_bdt: Num = 0
    status: ExchangeItemStatus = "PENDING"
    created_at: IsoTime = ""
    updated_at: IsoTime = ""


class ActivityLog(Entity):
    id: str
    exchange_id: str | None = None
    action: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: IsoTime = ""

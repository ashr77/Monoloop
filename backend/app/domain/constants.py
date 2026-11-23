"""Controlled vocabularies, mirrored from the shared frontend contract (frontend/src/lib/constants.ts)."""

from __future__ import annotations

from typing import Literal

MaterialFamily = Literal["STAINLESS_STEEL_SHEET", "PLYWOOD_PANEL"]
MaterialSpecification = Literal[
    "SS304", "SS201", "SS316", "PLYWOOD_STANDARD", "PLYWOOD_MARINE", "PLYWOOD_COMMERCIAL"
]
QuantityUnit = Literal["PIECE"]
MaterialCondition = Literal["UNUSED", "LEFTOVER", "OFFCUT"]
ConditionRequirement = Literal["ANY", "UNUSED", "LEFTOVER", "OFFCUT"]
ListingStatus = Literal["ACTIVE", "RESERVED", "COMPLETED", "ARCHIVED"]
RequirementStatus = Literal["OPEN", "FULFILLED", "CANCELLED"]
ExchangeStatus = Literal["PROPOSED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
ExchangeItemStatus = Literal["PENDING", "ACCEPTED", "REJECTED", "CANCELLED", "COMPLETED"]
MatchingStatus = Literal["EXACT_MATCH", "MULTI_SUPPLIER_MATCH", "PARTIAL_MATCH", "NO_MATCH"]
OrganizationType = Literal["SUPPLIER", "BUYER", "HYBRID"]

MATERIAL_FAMILIES: tuple[str, ...] = ("STAINLESS_STEEL_SHEET", "PLYWOOD_PANEL")
MATERIAL_SPECIFICATIONS: dict[str, tuple[str, ...]] = {
    "STAINLESS_STEEL_SHEET": ("SS304", "SS201", "SS316"),
    "PLYWOOD_PANEL": ("PLYWOOD_STANDARD", "PLYWOOD_MARINE", "PLYWOOD_COMMERCIAL"),
}
MATERIAL_CONDITIONS: tuple[str, ...] = ("UNUSED", "LEFTOVER", "OFFCUT")
LISTING_STATUSES: tuple[str, ...] = ("ACTIVE", "RESERVED", "COMPLETED", "ARCHIVED")
REQUIREMENT_STATUSES: tuple[str, ...] = ("OPEN", "FULFILLED", "CANCELLED")
EXCHANGE_STATUSES: tuple[str, ...] = ("PROPOSED", "IN_PROGRESS", "COMPLETED", "CANCELLED")
BANGLADESH_CITIES: tuple[str, ...] = (
    "Gazipur", "Dhaka", "Narayanganj", "Chattogram", "Khulna", "Bogura", "Cumilla",
)


def is_specification_valid_for_family(family: str, specification: str) -> bool:
    return specification in MATERIAL_SPECIFICATIONS.get(family, ())

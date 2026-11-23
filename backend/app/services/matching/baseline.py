"""Name-only baseline matcher (evaluation and UI comparison only).

Simulates a conventional marketplace search: a listing "matches" when its material family and
grade NAME match. It ignores size, thickness, condition, reservations and listing status, and
reports total stock as available.
"""

from __future__ import annotations

from app.schemas.entities import Listing, Requirement


def _name(s: str | None) -> str:
    return (s or "").strip().lower()


def baseline_matches(requirement: Requirement, listings: list[Listing]) -> list[Listing]:
    fam, spec = _name(requirement.material_family), _name(requirement.material_specification)
    return [
        l for l in listings
        if _name(l.material_family) == fam and _name(l.material_specification) == spec and l.status != "ARCHIVED"
    ]


def baseline_allocate(requirement: Requirement, listings: list[Listing]) -> list[dict]:
    """Naive allocation: total stock (ignores reservations) from the cheapest name matches."""
    remaining = requirement.required_quantity
    out: list[dict] = []
    for l in sorted(baseline_matches(requirement, listings), key=lambda x: x.unit_price_bdt):
        if remaining <= 0:
            break
        take = min(remaining, l.total_quantity)
        if take > 0:
            out.append({"listing_id": l.id, "quantity": take, "unit_price_bdt": float(l.unit_price_bdt)})
            remaining -= take
    return out

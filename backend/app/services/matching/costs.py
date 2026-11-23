"""Estimated delivered-cost model:  C_total = C_material + C_transport + C_handling.

Transport + handling is a one-off charge per supplier used (the t_s·y_s term of the
proposal's objective). Every figure is an ESTIMATE for ranking, not a logistics quotation.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.matching.formatting import js_round

HANDLING_BDT_PER_SUPPLIER = 1500
TRANSPORT_BDT_PER_KM = 60
SAME_CITY_KM = 10
UNKNOWN_DISTANCE_KM = 150

# Approximate road distances (km) between the demo cities. Symmetric.
_ROAD_KM: dict[str, dict[str, int]] = {
    "Dhaka": {"Gazipur": 35, "Narayanganj": 20, "Chattogram": 250, "Khulna": 220, "Bogura": 200, "Cumilla": 100},
    "Gazipur": {"Narayanganj": 50, "Chattogram": 280, "Khulna": 250, "Bogura": 170, "Cumilla": 130},
    "Narayanganj": {"Chattogram": 235, "Khulna": 240, "Bogura": 220, "Cumilla": 85},
    "Chattogram": {"Khulna": 420, "Bogura": 420, "Cumilla": 150},
    "Khulna": {"Bogura": 260, "Cumilla": 310},
    "Bogura": {"Cumilla": 290},
}
# Pre-computed O(1) lookup in both directions.
_DISTANCE: dict[frozenset[str], int] = {
    frozenset((a.lower(), b.lower())): km for a, row in _ROAD_KM.items() for b, km in row.items()
}


@dataclass(frozen=True, slots=True)
class DistanceEstimate:
    km: int
    known: bool


def _norm(city: str | None) -> str:
    return (city or "").strip().lower()


def estimate_distance_km(origin: str | None, destination: str | None) -> DistanceEstimate:
    a, b = _norm(origin), _norm(destination)
    if not a or not b:
        return DistanceEstimate(UNKNOWN_DISTANCE_KM, False)
    if a == b:
        return DistanceEstimate(SAME_CITY_KM, True)
    km = _DISTANCE.get(frozenset((a, b)))
    return DistanceEstimate(km, True) if km is not None else DistanceEstimate(UNKNOWN_DISTANCE_KM, False)


def estimate_transport_bdt(distance_km: float) -> int:
    """One-off transport + handling estimate for collecting from one supplier."""
    return HANDLING_BDT_PER_SUPPLIER + js_round(distance_km * TRANSPORT_BDT_PER_KM)

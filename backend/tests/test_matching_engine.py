"""Matching engine unit tests: plan tests T4-T8, allocation optimality, evaluation metrics."""

from __future__ import annotations

import itertools
import random

from app.schemas.entities import Listing, Organization, Requirement
from app.services.matching.allocation import EXHAUSTIVE_SUPPLIER_LIMIT, AllocationCandidate, allocate
from app.services.matching.costs import estimate_distance_km, estimate_transport_bdt
from app.services.matching.engine import run_matching
from app.services.matching.evaluation import evaluate

BUYER = Organization(id="BUY", name="Buyer", organization_type="BUYER", city="Dhaka")
ORGS = {
    "A": Organization(id="A", name="Supplier A", organization_type="SUPPLIER", city="Gazipur"),
    "B": Organization(id="B", name="Supplier B", organization_type="SUPPLIER", city="Dhaka"),
    "C": Organization(id="C", name="Supplier C", organization_type="SUPPLIER", city="Chattogram"),
}
T_GAZIPUR, T_DHAKA = estimate_transport_bdt(35), estimate_transport_bdt(10)
_ids = itertools.count(1)


def listing(supplier="A", **kw) -> Listing:
    org = ORGS[supplier]
    base = dict(id=f"L{next(_ids):03d}", organization_id=org.id, organization=org, city=org.city,
                material_family="STAINLESS_STEEL_SHEET", material_specification="SS304", length_mm=2400,
                width_mm=1200, thickness_mm=2, total_quantity=50, reserved_quantity=0, condition="UNUSED",
                unit_price_bdt=4000, status="ACTIVE")
    return Listing.model_validate({**base, **kw})


def requirement(**kw) -> Requirement:
    base = dict(id="REQ", organization_id=BUYER.id, organization=BUYER, material_family="STAINLESS_STEEL_SHEET",
                material_specification="SS304", length_mm=2400, width_mm=1200, thickness_mm=2,
                required_quantity=60, allow_split_suppliers=True, condition_requirement="ANY", status="OPEN")
    return Requirement.model_validate({**base, **kw})


def check(result, listing_id, rule):
    ev = next(e for e in result.evaluations if e.listing_id == listing_id)
    return next(c for c in ev.checks if c.rule == rule)


def test_t4_grade_mismatch_rejected():
    bad = listing(material_specification="SS201")
    r = run_matching(requirement(), [bad])
    assert r.matching_status == "NO_MATCH"
    c = check(r, bad.id, "SPECIFICATION")
    assert not c.passed and c.message == "Grade SS201 does not satisfy required SS304."


def test_t5_thickness_mismatch_rejected():
    bad = listing(thickness_mm=1.5)
    r = run_matching(requirement(), [bad])
    assert not check(r, bad.id, "THICKNESS").passed
    assert r.allocations == []


def test_t6_split_40_plus_20():
    a = listing("A", total_quantity=40, unit_price_bdt=4000)
    b = listing("B", total_quantity=35, unit_price_bdt=4200)
    r = run_matching(requirement(required_quantity=60), [a, b])
    assert r.matching_status == "MULTI_SUPPLIER_MATCH"
    assert r.allocated_quantities == {a.id: 40, b.id: 20}
    assert r.total_estimated_cost_bdt == 40 * 4000 + 20 * 4200 + T_GAZIPUR + T_DHAKA
    assert r.allocation_method == "EXHAUSTIVE_OPTIMAL"


def test_t7_reports_15_unfulfilled():
    r = run_matching(requirement(required_quantity=60), [listing("A", total_quantity=25), listing("B", total_quantity=20)])
    assert r.matching_status == "PARTIAL_MATCH"
    assert r.allocated_quantity == 45 and r.unfulfilled_quantity == 15


def test_t8_all_candidates_over_budget():
    r = run_matching(requirement(required_quantity=10, maximum_budget_bdt=10_000), [listing(unit_price_bdt=4000)])
    assert r.matching_status == "NO_MATCH"
    assert r.budget.status == "OVER_BUDGET"
    assert r.allocations == [] and r.over_budget_alternative


def test_reserved_stock_is_not_available():
    l = listing(total_quantity=50, reserved_quantity=45)
    r = run_matching(requirement(required_quantity=10), [l])
    assert r.allocated_quantity == 5 and r.matching_status == "PARTIAL_MATCH"


def test_rotated_sheet_matches_and_own_listing_excluded():
    rotated = listing("A", length_mm=1200, width_mm=2400)
    own = listing("A").model_copy(update={"organization_id": BUYER.id})
    r = run_matching(requirement(required_quantity=10), [rotated, own])
    assert next(e for e in r.evaluations if e.listing_id == rotated.id).rotated
    assert not check(r, own.id, "NOT_OWN_LISTING").passed


def test_no_split_uses_single_supplier():
    r = run_matching(requirement(required_quantity=60, allow_split_suppliers=False),
                     [listing("A", total_quantity=40), listing("B", total_quantity=35)])
    assert r.matching_status == "PARTIAL_MATCH" and len({a.supplier_organization_id for a in r.allocations}) == 1


def test_no_compatible_stock_budget_not_applicable():
    r = run_matching(requirement(maximum_budget_bdt=1000), [listing(material_specification="SS316")])
    assert r.budget.status == "NOT_APPLICABLE"


def test_distance_model():
    assert estimate_distance_km("Dhaka", "gazipur").km == 35
    assert estimate_distance_km("Dhaka", "Dhaka").km == 10
    assert estimate_distance_km("Dhaka", "Sylhet").km == 150 and not estimate_distance_km("Dhaka", "Sylhet").known


def _brute_force(qty, candidates, transport):
    """Independent optimum: every integer allocation, same priority order."""
    best = None
    ranges = [range(0, min(c.available_quantity, qty) + 1) for c in candidates]
    for xs in itertools.product(*ranges):
        got = sum(xs)
        if got > qty:
            continue
        used = {c.supplier_id for c, x in zip(candidates, xs, strict=True) if x}
        cost = sum(c.unit_price_bdt * x for c, x in zip(candidates, xs, strict=True)) + sum(transport[s] for s in used)
        key = (-got, cost, len(used))
        if best is None or key < best:
            best = key
    return best


def test_allocation_is_optimal_against_brute_force():
    rng = random.Random(20261124)
    for _ in range(300):
        n = rng.randint(1, 4)
        cands = [AllocationCandidate(f"L{i}", rng.choice("PQR"), rng.choice([90, 100, 110, 120]), rng.randint(0, 6))
                 for i in range(n)]
        transport = {s: rng.choice([0, 50, 150, 400]) for s in "PQR"}
        qty = rng.randint(1, 12)
        plan = allocate(qty, True, cands, transport)
        best = _brute_force(qty, cands, transport)
        if plan.allocated_quantity == 0:
            assert best is None or best[0] == 0
            continue
        assert (-plan.allocated_quantity, plan.total_cost_bdt, len(plan.supplier_ids)) <= best
        assert -plan.allocated_quantity == best[0] and plan.total_cost_bdt == best[1]


def test_greedy_fallback_beyond_supplier_limit():
    cands = [AllocationCandidate(f"L{i}", f"S{i:02d}", 100 + i, 1) for i in range(EXHAUSTIVE_SUPPLIER_LIMIT + 1)]
    plan = allocate(5, True, cands, {c.supplier_id: 10 for c in cands})
    assert plan.method == "GREEDY" and plan.allocated_quantity == 5


def test_evaluation_beats_name_only_baseline():
    report = evaluate()
    assert report.monoloop.precision == 1 and report.monoloop.recall == 1
    assert report.monoloop.falseFulfilmentClaims == 0 and report.monoloop.allocationErrorPieces == 0
    assert report.monoloop.estimatedCostOfFulfilledBdt == 1_367_700
    assert round(report.baseline.precision, 3) == 0.289
    assert report.baseline.falseFulfilmentClaims == 3 and report.baseline.allocationErrorPieces == 650

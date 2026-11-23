"""Explainable matching engine (pure, no I/O).

    Step 1  Specification validation   (rules.py, unknown specs fail)
    Step 2  Eligibility filtering      (all mandatory rules must pass)
    Step 3  Cost ranking               (costs.py, estimated delivered cost)
    Step 4  Allocation                 (allocation.py, optimal multi-supplier)

Given a requirement and listings it returns a MatchResult (a superset of the frozen
MatchProposal contract). A proposal is NOT a reservation: the exchange module re-checks stock
when each supplier accepts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.schemas.entities import Listing, Organization, Requirement, _iso
from app.schemas.matching import (
    BaselineComparison,
    BudgetAssessment,
    ListingEvaluation,
    MatchAllocationDetail,
    MatchResult,
)
from app.services.matching.allocation import AllocationCandidate, AllocationPlan, allocate
from app.services.matching.baseline import baseline_matches
from app.services.matching.costs import estimate_distance_km, estimate_transport_bdt
from app.services.matching.formatting import bdt, js_str
from app.services.matching.rules import evaluate_listing

ENGINE_VERSION = "1.0.0"


@dataclass(frozen=True, slots=True)
class _Cost:
    distance_km: int
    transport_bdt: int


def run_matching(
    requirement: Requirement,
    listings: list[Listing],
    buyer_organization: Organization | None = None,
    now: datetime | None = None,
) -> MatchResult:
    buyer = buyer_organization or requirement.organization
    buyer_city = buyer.city if buyer else None
    required = int(requirement.required_quantity // 1)

    # Steps 1-2: evaluate every listing against every mandatory rule.
    evaluations = [evaluate_listing(requirement, l, requirement.organization_id) for l in listings]
    compatible = [e for e in evaluations if e.compatible]
    by_id = {e.listing_id: e for e in evaluations}

    # Step 3: transport + handling estimate, charged once per compatible supplier.
    cost_by_supplier: dict[str, _Cost] = {}
    for e in compatible:
        if e.supplier_organization_id not in cost_by_supplier:
            distance = estimate_distance_km(e.city, buyer_city)
            cost_by_supplier[e.supplier_organization_id] = _Cost(distance.km, estimate_transport_bdt(distance.km))

    # Step 4: allocation.
    plan = allocate(
        required_quantity=required,
        allow_split_suppliers=requirement.allow_split_suppliers,
        candidates=[
            AllocationCandidate(e.listing_id, e.supplier_organization_id, e.unit_price_bdt, e.available_quantity)
            for e in compatible
        ],
        transport_by_supplier={s: c.transport_bdt for s, c in cost_by_supplier.items()},
    )
    details = _allocation_details(plan, by_id, cost_by_supplier)

    budget = _assess_budget(requirement.maximum_budget_bdt, plan, required)
    over_budget = budget.status == "OVER_BUDGET"
    allocations = [] if over_budget else details
    allocated = 0 if over_budget else plan.allocated_quantity

    used = {a.listing_id: a.allocated_quantity for a in allocations}
    for e in evaluations:
        e.allocated_quantity = used.get(e.listing_id, 0)

    status = _derive_status(allocations, allocated, required)

    return MatchResult(
        requirement_id=requirement.id,
        requested_quantity=required,
        matching_status=status,
        allocations=allocations,
        compatible_supplier_ids=sorted({e.supplier_organization_id for e in compatible}),
        listing_ids=[a.listing_id for a in allocations],
        allocated_quantities={a.listing_id: a.allocated_quantity for a in allocations},
        estimated_material_costs_bdt=0 if over_budget else plan.material_cost_bdt,
        estimated_transportation_costs_bdt=0 if over_budget else plan.transport_cost_bdt,
        total_estimated_cost_bdt=0 if over_budget else plan.total_cost_bdt,
        compatibility_explanations=_explanations(
            status, allocations, allocated, required, len(compatible), budget,
            requirement.allow_split_suppliers, _max_single_supplier_capacity(compatible),
        ),
        rejection_reasons=_rejections(evaluations, requirement),
        unfulfilled_quantity=required - allocated,
        engine_version=ENGINE_VERSION,
        generated_at=_iso(now or datetime.now(UTC)),
        requirement_status=requirement.status,
        allow_split_suppliers=requirement.allow_split_suppliers,
        allocated_quantity=allocated,
        evaluations=_sort_evaluations(evaluations, requirement.material_family),
        budget=budget,
        baseline=_compare_baseline(requirement, listings, by_id),
        allocation_method=plan.method if allocations else "NONE",
        over_budget_alternative=details if over_budget else None,
    )


# --------------------------------------------------------------------------- helpers


def _allocation_details(
    plan: AllocationPlan, by_id: dict[str, ListingEvaluation], costs: dict[str, _Cost]
) -> list[MatchAllocationDetail]:
    charged: set[str] = set()
    out = []
    for line in plan.lines:
        ev, cost = by_id[line.listing_id], costs[line.supplier_id]
        first = line.supplier_id not in charged
        charged.add(line.supplier_id)
        out.append(MatchAllocationDetail(
            listing_id=line.listing_id,
            supplier_organization_id=line.supplier_id,
            supplier_name=ev.supplier_name,
            allocated_quantity=line.quantity,
            unit_price_bdt=line.unit_price_bdt,
            subtotal_bdt=line.subtotal_bdt,
            city=ev.city,
            technical_notes=ev.reason,
            estimated_transport_bdt=cost.transport_bdt if first else 0,
            distance_km=cost.distance_km,
        ))
    return out


def _assess_budget(max_budget: float | None, plan: AllocationPlan, required: int) -> BudgetAssessment:
    limit = None if max_budget is None else float(max_budget)
    cheapest = plan.total_cost_bdt if plan.allocated_quantity > 0 else None

    if limit is None:
        return BudgetAssessment(status="NO_BUDGET", maximum_budget_bdt=None,
                                cheapest_estimated_cost_bdt=cheapest, message="No budget limit set.")
    if cheapest is None:
        return BudgetAssessment(status="NOT_APPLICABLE", maximum_budget_bdt=limit, cheapest_estimated_cost_bdt=None,
                                message="No compatible stock to price against the budget.")

    partial = plan.allocated_quantity < required
    applicable = (limit * plan.allocated_quantity) / required if partial else limit
    scope = (f"prorated budget {bdt(applicable)} for {plan.allocated_quantity} of {required} pieces"
             if partial else f"budget {bdt(limit)}")
    if plan.total_cost_bdt <= applicable + 1e-6:
        return BudgetAssessment(status="WITHIN_BUDGET", maximum_budget_bdt=limit, cheapest_estimated_cost_bdt=cheapest,
                                message=f"Estimated delivered cost {bdt(cheapest)} is within the {scope}.")
    return BudgetAssessment(
        status="OVER_BUDGET", maximum_budget_bdt=limit, cheapest_estimated_cost_bdt=cheapest,
        message=f"No budget-feasible allocation: the cheapest compatible option costs {bdt(cheapest)}, above the {scope}.",
    )


def _derive_status(allocations: list[MatchAllocationDetail], allocated: int, required: int) -> str:
    if not allocations or allocated == 0:
        return "NO_MATCH"
    if allocated < required:
        return "PARTIAL_MATCH"
    return "MULTI_SUPPLIER_MATCH" if len({a.supplier_organization_id for a in allocations}) > 1 else "EXACT_MATCH"


def _explanations(
    status: str, allocations: list[MatchAllocationDetail], allocated: int, required: int,
    compatible_count: int, budget: BudgetAssessment, allow_split: bool, largest_single_supplier: int,
) -> list[str]:
    lines: list[str] = []
    suppliers = len({a.supplier_organization_id for a in allocations})
    if status == "EXACT_MATCH":
        lines.append(f"One supplier fulfils all {required} pieces.")
    if status == "MULTI_SUPPLIER_MATCH":
        lines.append(
            f"No single supplier holds {required} compatible pieces (largest: {largest_single_supplier}); "
            f"combining {suppliers} suppliers fulfils the requirement."
            if largest_single_supplier < required
            else f"Combining {suppliers} suppliers is cheaper overall than sourcing all {required} pieces from one supplier."
        )
    if status == "PARTIAL_MATCH":
        scope = " from all compatible stock" if allow_split else " by a single supplier (multi-supplier sourcing not allowed)"
        lines.append(f"Only {allocated} of {required} pieces can be supplied{scope}; {required - allocated} remain unfulfilled.")
    if status == "NO_MATCH" and compatible_count == 0:
        lines.append("No listing satisfies every mandatory specification.")

    for a in allocations:
        transport = (f" + est. transport {bdt(a.estimated_transport_bdt)} ({js_str(a.distance_km)} km)."
                     if a.estimated_transport_bdt > 0 else ".")
        lines.append(f"{a.supplier_name} ({a.city}): {a.allocated_quantity} pcs × {bdt(a.unit_price_bdt)} = "
                     f"{bdt(a.subtotal_bdt)}{transport}")
    if budget.status in ("WITHIN_BUDGET", "OVER_BUDGET"):
        lines.append(budget.message)
    return lines


def _max_single_supplier_capacity(compatible: list[ListingEvaluation]) -> int:
    totals: dict[str, int] = {}
    for e in compatible:
        totals[e.supplier_organization_id] = totals.get(e.supplier_organization_id, 0) + e.available_quantity
    return max([0, *totals.values()])


def _is_other_family(e: ListingEvaluation) -> bool:
    return any(c.rule == "MATERIAL_FAMILY" and not c.passed for c in e.checks)


def _rejections(evaluations: list[ListingEvaluation], requirement: Requirement) -> list[str]:
    lines = [f"{e.supplier_name} – {e.material_specification}, {e.dimensions}: {e.reason}"
             for e in evaluations if not e.compatible and not _is_other_family(e)]
    other = sum(1 for e in evaluations if _is_other_family(e))
    if other > 0:
        lines.append(f"{other} listing(s) of other material families were excluded.")
    return lines


def _sort_evaluations(evaluations: list[ListingEvaluation], family: str) -> list[ListingEvaluation]:
    """Allocated first, then other compatible, then same-family rejections, then other families."""

    def rank(e: ListingEvaluation) -> int:
        if e.allocated_quantity > 0:
            return 0
        if e.compatible:
            return 1
        fam = next((c.actual for c in e.checks if c.rule == "MATERIAL_FAMILY"), None)
        return 2 if fam == family else 3

    return sorted(evaluations, key=lambda e: (rank(e), e.unit_price_bdt, e.listing_id))


def _compare_baseline(
    requirement: Requirement, listings: list[Listing], by_id: dict[str, ListingEvaluation]
) -> BaselineComparison:
    suggested = baseline_matches(requirement, listings)
    ids = [l.id for l in suggested]
    incompatible = [i for i in ids if not (by_id.get(i) and by_id[i].compatible)]
    claimed = sum(l.total_quantity for l in suggested)
    n, k = len(suggested), len(incompatible)
    if n == 0:
        message = "A name-only search finds no listings either."
    elif k == 0:
        message = f"A name-only search suggests {n} listing(s), all technically compatible."
    else:
        message = (f"A name-only search suggests {n} listing{'' if n == 1 else 's'}; {k} of them "
                   f"{'fails' if k == 1 else 'fail'} a mandatory specification and would have misled the buyer.")
    return BaselineComparison(suggested_listing_ids=ids, incompatible_suggestion_ids=incompatible,
                              claimed_quantity=claimed, message=message)

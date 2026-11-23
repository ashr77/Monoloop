"""Stage 2: multi-supplier allocation.

Objective (proposal §7):   min  Σ p_i·x_i  +  Σ t_s·y_s
    x_i  pieces taken from compatible listing i   (0 ≤ x_i ≤ available_i)
    y_s  1 if supplier s is used (fixed transport + handling t_s)

Priority order of the result:
    1. Fulfil as many pieces as possible (ideally all).
    2. Then minimise estimated delivered cost.
    3. Then prefer fewer suppliers, then deterministic id order.

Exactness: for a FIXED set of suppliers, taking the cheapest units first is optimal (costs are
linear), so enumerating every supplier subset and filling cheapest-first finds the global
optimum. Exhaustive up to EXHAUSTIVE_SUPPLIER_LIMIT suppliers, greedy beyond that.

Performance: candidates are sorted once; each subset is filled by a single ordered scan with a
bitmask membership test (no per-subset sorting or list building).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Literal

EXHAUSTIVE_SUPPLIER_LIMIT = 12

Method = Literal["EXHAUSTIVE_OPTIMAL", "GREEDY", "NONE"]


@dataclass(frozen=True, slots=True)
class AllocationCandidate:
    listing_id: str
    supplier_id: str
    unit_price_bdt: float
    available_quantity: int


@dataclass(frozen=True, slots=True)
class AllocationLine:
    listing_id: str
    supplier_id: str
    quantity: int
    unit_price_bdt: float
    subtotal_bdt: float


@dataclass(frozen=True, slots=True)
class AllocationPlan:
    lines: tuple[AllocationLine, ...] = ()
    supplier_ids: tuple[str, ...] = ()
    allocated_quantity: int = 0
    material_cost_bdt: float = 0
    transport_cost_bdt: float = 0
    total_cost_bdt: float = 0
    method: Method = "NONE"


EMPTY_PLAN = AllocationPlan()


@dataclass(slots=True)
class _Filler:
    ordered: list[AllocationCandidate]
    supplier_bit: dict[str, int]
    transport: dict[str, float]
    qty: int

    def fill(self, mask: int | None) -> AllocationPlan:
        """Fill qty cheapest-first from listings whose supplier is in mask (None = all)."""
        lines: list[AllocationLine] = []
        remaining = self.qty
        for c in self.ordered:
            if remaining <= 0:
                break
            if mask is not None and not (mask >> self.supplier_bit[c.supplier_id]) & 1:
                continue
            take = min(remaining, max(0, math.floor(c.available_quantity)))
            if take <= 0:
                continue
            lines.append(AllocationLine(c.listing_id, c.supplier_id, take, c.unit_price_bdt, take * c.unit_price_bdt))
            remaining -= take
        supplier_ids = tuple(sorted({line.supplier_id for line in lines}))
        material = sum(line.subtotal_bdt for line in lines)
        transport = sum(self.transport.get(s, 0) for s in supplier_ids)
        return AllocationPlan(
            lines=tuple(lines),
            supplier_ids=supplier_ids,
            allocated_quantity=self.qty - remaining,
            material_cost_bdt=material,
            transport_cost_bdt=transport,
            total_cost_bdt=material + transport,
            method="EXHAUSTIVE_OPTIMAL",
        )


def _is_better(a: AllocationPlan, b: AllocationPlan | None) -> bool:
    if b is None:
        return True
    if a.allocated_quantity != b.allocated_quantity:
        return a.allocated_quantity > b.allocated_quantity
    if a.total_cost_bdt != b.total_cost_bdt:
        return a.total_cost_bdt < b.total_cost_bdt
    if len(a.supplier_ids) != len(b.supplier_ids):
        return len(a.supplier_ids) < len(b.supplier_ids)
    return "|".join(a.supplier_ids) < "|".join(b.supplier_ids)


def allocate(
    required_quantity: float,
    allow_split_suppliers: bool,
    candidates: list[AllocationCandidate],
    transport_by_supplier: dict[str, float],
) -> AllocationPlan:
    qty = math.floor(required_quantity)
    usable = [c for c in candidates if c.available_quantity > 0 and math.isfinite(c.unit_price_bdt)]
    if qty <= 0 or not usable:
        return EMPTY_PLAN

    ordered = sorted(usable, key=lambda c: (c.unit_price_bdt, c.listing_id))
    suppliers = sorted({c.supplier_id for c in usable})
    bit = {s: i for i, s in enumerate(suppliers)}
    filler = _Filler(ordered, bit, transport_by_supplier, qty)

    best: AllocationPlan | None = None

    # Single supplier only: evaluate each supplier on its own (always exact, O(S·N)).
    if not allow_split_suppliers:
        for s in suppliers:
            plan = filler.fill(1 << bit[s])
            if _is_better(plan, best):
                best = plan
        return best or EMPTY_PLAN

    # Exhaustive search over supplier subsets.
    if len(suppliers) <= EXHAUSTIVE_SUPPLIER_LIMIT:
        for mask in range(1, 1 << len(suppliers)):
            plan = filler.fill(mask)
            # A subset where some supplier contributes nothing is dominated by a smaller subset.
            if len(plan.supplier_ids) != mask.bit_count():
                continue
            if _is_better(plan, best):
                best = plan
        return best or EMPTY_PLAN

    # Greedy fallback for very large candidate sets: cheapest units first.
    return replace(filler.fill(None), method="GREEDY")

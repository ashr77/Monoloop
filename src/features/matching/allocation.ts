// ============================================================================
// MONOLOOP - Stage 2: Multi-supplier allocation (Member 3)
//
// Objective (proposal §7):   min  Σ p_i·x_i  +  Σ t_s·y_s
//   x_i  pieces taken from compatible listing i   (0 ≤ x_i ≤ available_i)
//   y_s  1 if supplier s is used (fixed transport + handling t_s)
//
// Priority order of the result:
//   1. Fulfil as many pieces as possible (ideally all of them).
//   2. Among those, minimise estimated delivered cost.
//   3. Then prefer fewer suppliers, then deterministic id order.
//
// Exactness: for a FIXED set of suppliers, taking the cheapest units first is
// optimal (costs are linear). So enumerating every supplier subset and
// filling cheapest-first yields the global optimum. Compatible suppliers per
// requirement are few, so this is exhaustive up to EXHAUSTIVE_SUPPLIER_LIMIT
// suppliers and falls back to a greedy heuristic beyond that.
// ============================================================================

export const EXHAUSTIVE_SUPPLIER_LIMIT = 12;

export interface AllocationCandidate {
  listing_id: string;
  supplier_id: string;
  unit_price_bdt: number;
  available_quantity: number;
}

export interface AllocationInput {
  requiredQuantity: number;
  allowSplitSuppliers: boolean;
  candidates: AllocationCandidate[];
  /** One-off transport + handling estimate per supplier id. */
  transportBySupplier: Record<string, number>;
}

export interface AllocationLine {
  listing_id: string;
  supplier_id: string;
  quantity: number;
  unit_price_bdt: number;
  subtotal_bdt: number;
}

export interface AllocationPlan {
  lines: AllocationLine[];
  supplierIds: string[];
  allocatedQuantity: number;
  materialCostBdt: number;
  transportCostBdt: number;
  totalCostBdt: number;
  method: 'EXHAUSTIVE_OPTIMAL' | 'GREEDY' | 'NONE';
}

const EMPTY_PLAN: AllocationPlan = {
  lines: [],
  supplierIds: [],
  allocatedQuantity: 0,
  materialCostBdt: 0,
  transportCostBdt: 0,
  totalCostBdt: 0,
  method: 'NONE',
};

const byPriceThenId = (a: AllocationCandidate, b: AllocationCandidate) =>
  a.unit_price_bdt - b.unit_price_bdt || a.listing_id.localeCompare(b.listing_id);

/** Fill `qty` from the given listings, cheapest first. */
function fillCheapestFirst(
  listings: AllocationCandidate[],
  qty: number,
  transportBySupplier: Record<string, number>
): AllocationPlan {
  const lines: AllocationLine[] = [];
  let remaining = qty;
  for (const l of [...listings].sort(byPriceThenId)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.max(0, Math.floor(l.available_quantity)));
    if (take <= 0) continue;
    lines.push({
      listing_id: l.listing_id,
      supplier_id: l.supplier_id,
      quantity: take,
      unit_price_bdt: l.unit_price_bdt,
      subtotal_bdt: take * l.unit_price_bdt,
    });
    remaining -= take;
  }
  const supplierIds = Array.from(new Set(lines.map((l) => l.supplier_id))).sort();
  const materialCostBdt = lines.reduce((s, l) => s + l.subtotal_bdt, 0);
  const transportCostBdt = supplierIds.reduce((s, id) => s + (transportBySupplier[id] ?? 0), 0);
  return {
    lines,
    supplierIds,
    allocatedQuantity: qty - remaining,
    materialCostBdt,
    transportCostBdt,
    totalCostBdt: materialCostBdt + transportCostBdt,
    method: 'EXHAUSTIVE_OPTIMAL',
  };
}

/** True if `a` is a better plan than `b` under the priority order above. */
function isBetter(a: AllocationPlan, b: AllocationPlan | null): boolean {
  if (!b) return true;
  if (a.allocatedQuantity !== b.allocatedQuantity) return a.allocatedQuantity > b.allocatedQuantity;
  if (a.totalCostBdt !== b.totalCostBdt) return a.totalCostBdt < b.totalCostBdt;
  if (a.supplierIds.length !== b.supplierIds.length) return a.supplierIds.length < b.supplierIds.length;
  return a.supplierIds.join('|') < b.supplierIds.join('|');
}

export function allocate(input: AllocationInput): AllocationPlan {
  const qty = Math.floor(input.requiredQuantity);
  const usable = input.candidates.filter((c) => c.available_quantity > 0 && Number.isFinite(c.unit_price_bdt));
  if (qty <= 0 || usable.length === 0) return { ...EMPTY_PLAN };

  const bySupplier = new Map<string, AllocationCandidate[]>();
  for (const c of usable) {
    const list = bySupplier.get(c.supplier_id) ?? [];
    list.push(c);
    bySupplier.set(c.supplier_id, list);
  }
  const suppliers = Array.from(bySupplier.keys()).sort();

  // Single-supplier only: evaluate each supplier independently (always exact, O(S)).
  if (!input.allowSplitSuppliers) {
    let best: AllocationPlan | null = null;
    for (const s of suppliers) {
      const plan = fillCheapestFirst(bySupplier.get(s)!, qty, input.transportBySupplier);
      if (isBetter(plan, best)) best = plan;
    }
    return best ?? { ...EMPTY_PLAN };
  }

  // Exhaustive search over supplier subsets.
  if (suppliers.length <= EXHAUSTIVE_SUPPLIER_LIMIT) {
    let best: AllocationPlan | null = null;
    const total = 1 << suppliers.length;
    for (let mask = 1; mask < total; mask++) {
      const chosen = suppliers.filter((_, i) => mask & (1 << i));
      const plan = fillCheapestFirst(chosen.flatMap((s) => bySupplier.get(s)!), qty, input.transportBySupplier);
      // A subset where some supplier contributes nothing is dominated by a smaller subset.
      if (plan.supplierIds.length !== chosen.length) continue;
      if (isBetter(plan, best)) best = plan;
    }
    return best ?? { ...EMPTY_PLAN };
  }

  // Greedy fallback for very large candidate sets: cheapest units first.
  return { ...fillCheapestFirst(usable, qty, input.transportBySupplier), method: 'GREEDY' };
}

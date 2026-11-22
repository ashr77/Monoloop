# MONOLOOP Team Contracts & Shared Architecture
**TSUNAGU Hackathon 2026**  
**Tagline:** One Industry's Surplus. Another's Opportunity.

---

## 1. Team Ownership Boundaries

| Member | Focus Area | Routes & Components Owned |
| :--- | :--- | :--- |
| **Member 1 (Current)** | **Project & Database Foundation, Supply Management, AI Listing Extraction** | `src/app/supply/**`, `src/features/supply/**`, `src/app/api/listings/**`, `src/app/api/ai/extract-material/**`, `supabase/migrations/**`, `src/lib/types.ts`, `src/lib/constants.ts` |
| **Member 2** | **Navigation, Demand Management, Buyer Requirements Dashboard** | `src/app/demand/**`, `src/features/demand/**`, `src/app/api/requirements/**`, Shared header & layout navigation |
| **Member 3** | **Technical Compatibility Engine, Explainable Matching, Multi-Supplier Allocation** | `src/app/matches/**`, `src/features/matching/**`, `src/app/api/matches/**` |
| **Member 4** | **Exchange Transactions, Atomic Inventory Reservation, Impact & Resource Recovery** | `src/app/exchanges/**`, `src/features/exchanges/**`, `src/app/impact/**`, `src/features/analytics/**`, `src/app/api/exchanges/**`, `src/app/api/impact/**` |

---

## 2. Core Domain Rules & Controlled Vocabularies

### Units
- **Dimensions:** Length, Width, Thickness are strictly in **Millimeters (`mm`)** as positive numbers (`NUMERIC > 0`).
- **Quantities:** Strictly integer **`PIECE`** (`total_quantity >= 0`, `reserved_quantity >= 0`).
- **Currencies:** All monetary figures are in Bangladeshi Taka (**`BDT`**).

### Material Families & Specifications
For the hackathon, exactly two material families are supported:
1. `STAINLESS_STEEL_SHEET`:
   - Allowed specifications: `SS304`, `SS201`, `SS316`
2. `PLYWOOD_PANEL`:
   - Allowed specifications: `PLYWOOD_STANDARD`, `PLYWOOD_MARINE`, `PLYWOOD_COMMERCIAL`

### Material Conditions
- `UNUSED`: Prime / brand-new excess materials.
- `LEFTOVER`: Factory surplus from completed batches.
- `OFFCUT`: Clean dimensional offcuts / remanufacturing scraps.

### Inventory Invariant
$$\text{available\_quantity} = \text{total\_quantity} - \text{reserved\_quantity}$$
- Database check constraints strictly enforce:
  - $\text{total\_quantity} \ge 0$
  - $\text{reserved\_quantity} \ge 0$
  - $\text{reserved\_quantity} \le \text{total\_quantity}$
- **Protected Field:** Public listing APIs and forms **must never allow clients to set or directly update `reserved_quantity`**.
- Atomic reservations must be performed using PostgreSQL row locks or the database helper function `reserve_listing_quantity(listing_id, qty)`.

---

## 3. Database Schema Overview

The database uses PostgreSQL (Supabase). Migrations are located in `supabase/migrations/`:

1. `organizations`: Fictional demo suppliers and buyers (`id`, `name`, `organization_type`, `city`, `address`).
2. `listings`: Material surplus listings created by suppliers (`organization_id`, `material_family`, `material_specification`, `length_mm`, `width_mm`, `thickness_mm`, `total_quantity`, `reserved_quantity`, `available_quantity`, `condition`, `unit_price_bdt`, `city`, `status`).
3. `requirements`: Demand requirements published by buyers (`organization_id`, `material_family`, `material_specification`, dimensions, `required_quantity`, `maximum_budget_bdt`, `allow_split_suppliers`, `condition_requirement`, `status`).
4. `exchanges`: Exchange transactions connecting buyer demand to allocated supplier items.
5. `exchange_items`: Individual items reserved from listings for a given exchange.
6. `activity_logs`: Immutable audit trails for exchange events.

---

## 4. Shared API Response Convention

All Next.js Route Handlers (`src/app/api/**`) return standardized JSON conforming to `ApiResponse<T>`:

```typescript
// Success Response
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 10
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR", // or NOT_FOUND, CONFLICT, INTERNAL_SERVER_ERROR
    "message": "Human readable error description",
    "details": { ... } // optional validation issues from Zod
  }
}
```

---

## 5. Matching Proposal Contract (For Member 3 & Member 4)

When Member 3's matching engine processes a requirement against active listings, it produces a `MatchProposal` object:

```typescript
export interface MatchAllocation {
  listing_id: string;
  supplier_organization_id: string;
  supplier_name: string;
  allocated_quantity: number;
  unit_price_bdt: number;
  subtotal_bdt: number;
  city: string;
  technical_notes: string;
}

export interface MatchProposal {
  requirement_id: string;
  requested_quantity: number;
  matching_status: 'EXACT_MATCH' | 'MULTI_SUPPLIER_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH';
  allocations: MatchAllocation[];
  compatible_supplier_ids: string[];
  listing_ids: string[];
  allocated_quantities: Record<string, number>;
  estimated_material_costs_bdt: number;
  estimated_transportation_costs_bdt?: number;
  total_estimated_cost_bdt: number;
  compatibility_explanations: string[];
  rejection_reasons?: string[];
  unfulfilled_quantity: number;
}
```

---

## 6. Guidelines for Member 2 (Starting Demand Module)

1. **Working Directory:** Implement your feature under `src/features/demand/**` and route under `src/app/demand/**`.
2. **Shared Layout:** Member 2 owns the global header/nav in `src/components/shared/` or `src/app/layout.tsx`.
3. **Database Access:** Use `getSupabaseServerClient()` or the data repository in `src/lib/supabase/repository.ts`.
4. **Validation:** Use Zod schemas matching `src/lib/types.ts` (`MaterialRequirement`).
5. **Demo Organizations:** Use `DEMO_ORGANIZATIONS` from `src/lib/constants.ts` to populate buyer selector dropdowns.

# MONOLOOP Exchanges & Impact (Member 4)

This module turns a match proposal into a recorded transfer of material and reports the resulting reuse.

| Item | Location |
| :-- | :-- |
| State machine (pure TypeScript) | `src/features/exchanges/workflow.ts` |
| Repository: Supabase RPC or in-memory demo | `src/features/exchanges/services/exchangeRepository.ts` |
| Database functions (atomic) | `supabase/migrations/00004_exchange_workflow.sql` |
| Impact analytics | `src/features/analytics/impact.ts` |
| UI | `/exchanges` (`?as=<orgId>` sets the demo identity), `/impact` (`?org=<orgId>` scopes to one organization) |
| Tests | `src/features/exchanges/tests/` (`npm test`) |

**Setup:** run `supabase/migrations/00004_exchange_workflow.sql` after migrations 00001–00003, for example in the Supabase SQL editor. It is safe to run more than once.

---

## 1. Lifecycle

```
Request ──▶ each supplier accepts (stock reserved) ──▶ Reserved ──▶ buyer confirms ──▶ Completed
   │                     │                                  │
   │                     └── a supplier declines ──▶ buyer cancels (releases reserved stock)
   └──────────────────────────── buyer cancels at any point before completion ─────────────┘
```

| Stage (UI) | `exchanges.status` | Meaning |
| :-- | :-- | :-- |
| Awaiting suppliers | `PROPOSED` | At least one item is still `PENDING`. |
| Supplier declined | `PROPOSED` with a `REJECTED` item | The exchange can no longer complete. The buyer cancels it and requests again. |
| Stock reserved | `IN_PROGRESS` | Every item is `ACCEPTED` and all of its stock is reserved. |
| Completed | `COMPLETED` | Inventory has been deducted and the reuse is counted. |
| Cancelled | `CANCELLED` | Every reservation has been released. |

### Inventory rules

Inventory changes in exactly three places:

| Event | `reserved_quantity` | `total_quantity` |
| :-- | :-- | :-- |
| Supplier accepts | `+q`, only if `total − reserved ≥ q`, otherwise `INSUFFICIENT_STOCK` | unchanged |
| Buyer completes | `−q` | `−q`. The listing becomes `COMPLETED` when its total reaches 0. |
| Buyer cancels (accepted items only) | `−q` | unchanged |

The requirement becomes `FULFILLED` once the quantity completed against it covers `required_quantity`.

## 2. Why it cannot over-allocate

- **A match is a proposal.** `POST /api/exchanges` re-runs Member 3's matching engine on the server from live inventory, so a browser cannot submit allocations of its own.
- **Stock is reserved when a supplier accepts, not when the buyer requests.** Each accept is one PL/pgSQL function call, and therefore one transaction. Rows are locked in a fixed order (exchange → item → listing). Two buyers racing for the same sheets are serialized: the second one gets `409 INSUFFICIENT_STOCK` and nothing changes.
- **Completion requires `IN_PROGRESS`.** A second completion attempt gets `409`, so inventory is deducted exactly once.
- A partial unique index allows only one active exchange per requirement.
- The listing `CHECK` constraints stay in place as a final safety net.

## 3. API

All mutating calls identify the acting organization with the `x-organization-id` header (demo identity).

| Endpoint | Who | Body |
| :-- | :-- | :-- |
| `GET /api/exchanges?organization_id=&status=` | anyone | — |
| `POST /api/exchanges` | buyer | `{ requirement_id, buyer_organization_id }` |
| `GET /api/exchanges/[id]` | anyone | — |
| `POST /api/exchanges/[id]/accept` | item supplier | `{ exchange_item_id }` |
| `POST /api/exchanges/[id]/reject` | item supplier | `{ exchange_item_id }` |
| `POST /api/exchanges/[id]/complete` | buyer | — |
| `POST /api/exchanges/[id]/cancel` | buyer | — |
| `GET /api/impact?organization_id=` | anyone | — |

| Error code | HTTP |
| :-- | :-- |
| `VALIDATION_ERROR`, `ACTOR_REQUIRED` | 400 |
| `FORBIDDEN_ORGANIZATION` | 403 |
| `NOT_FOUND` | 404 |
| `INVALID_STATE`, `INSUFFICIENT_STOCK`, `LISTING_UNAVAILABLE`, `DUPLICATE_EXCHANGE`, `REQUIREMENT_NOT_OPEN` | 409 |
| `NO_ALLOCATION` (matching found nothing compatible or within budget) | 422 |

## 4. Impact figures

- Only `COMPLETED` items count as reuse. Proposed and reserved stock is reported separately as pipeline.
- **Value** uses the unit price captured when the exchange was requested (`exchange_items.unit_price_bdt`). It excludes transport.
- **Mass** is an indicative estimate from nominal dimensions: stainless steel 7,930 kg/m³, plywood 600 kg/m³.
- All data is synthetic. These figures are not real environmental savings.

## 5. Test coverage (plan §14)

| Test | Where |
| :-- | :-- |
| T9: two buyers reserving the same stock | `workflow.test.ts` |
| T10: a supplier declines | `workflow.test.ts`, `api.test.ts` |
| T11: cancelling releases reserved stock | `workflow.test.ts`, `api.test.ts` |
| T12: completion updates inventory and analytics exactly once | `workflow.test.ts`, `api.test.ts` |

The SQL functions in `00004` were also run against a real PostgreSQL engine (PGlite) through the same scenarios, including rollback on a failed accept.

## 6. Known limits

- After a partial completion the requirement stays `OPEN`. A follow-up match is computed against the full `required_quantity`, not the remainder.
- Identity is the demo `x-organization-id` header. There is no production authentication.

---

## 7. Payment (SSLCommerz)

The buyer pays the material value of a **reserved** exchange before confirming the transfer.

```
Reserved ──"Pay ৳…"──▶ SSLCommerz checkout ──▶ /api/payments/sslcommerz/success
        ──backend validates val_id with the gateway──▶ PAID ──"Confirm transfer"──▶ Completed
```

| Item | Location |
| :-- | :-- |
| Migration | `supabase/migrations/00005_payments.sql` (table `payments`, one PAID per exchange) |
| Gateway (Strategy) | `backend/app/services/payments/gateway.py` (`SSLCommerzGateway`) |
| Rules | `backend/app/services/payments/service.py` |
| API | `POST /api/payments/exchanges/{id}`, `POST /api/payments/sslcommerz/{success,fail,cancel,ipn}` |
| Tests | `backend/tests/test_payments.py` |

- **Never trusts the redirect.** On success or IPN the backend calls the SSLCommerz validation API with `val_id`. It marks the payment PAID only if status, `tran_id`, amount and currency (BDT) all match. Forged or tampered callbacks end as FAILED.
- **Counted once.** INITIATED → PAID is a conditional update, and a unique index allows one PAID payment per exchange. Duplicate callbacks are harmless.
- **Rules when payment is on:** completing requires PAID (`409 PAYMENT_REQUIRED`). A paid exchange cannot be cancelled, because refunds are out of scope.
- **Off by default.** With `PAYMENT_PROVIDER=none`, exchanges complete without payment, exactly as before.

**Setup:**
1. Run `00005_payments.sql`.
2. In `backend/.env` set `PAYMENT_PROVIDER=sslcommerz`, `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD`, and keep `SSLCOMMERZ_SANDBOX=true`.
3. Sandbox test card: VISA `4111 1111 1111 1111`, CVV `111`, any future expiry, OTP `111111`.

The IPN reaches the backend only when `PUBLIC_API_URL` is public. Locally, the success redirect does the validation.

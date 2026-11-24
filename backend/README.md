# MONOLOOP Backend (FastAPI)

Every API endpoint of MONOLOOP: supply, demand, explainable matching, exchanges with atomic stock reservation, impact analytics and AI extraction. The Next.js frontend in `../frontend` holds no server code and no secrets; it calls this API through `frontend/src/hooks`.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000     # interactive docs: http://localhost:8000/docs
.venv/bin/pytest                                         # 106 tests (+15 opt-in: live Supabase, chat rules on PostgreSQL)
.venv/bin/ruff check app tests
```

## Data backends

| Settings in `backend/.env` | Backend (`DATA_BACKEND`) | Use |
| :-- | :-- | :-- |
| nothing set | `memory`: in-memory store seeded from `app/seed/seed_data.json` | demo, tests, frontend work without a database |
| `DATABASE_URL` = Supabase **Session pooler** URI (port 5432) | `postgres`: SQLAlchemy async + asyncpg | real data (needs the database password) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `supabase`: Supabase REST (PostgREST) over HTTPS | real data without the database password |

With `DATA_BACKEND=auto`: Postgres if `DATABASE_URL` is set, otherwise Supabase REST if both `SUPABASE_` values are set, otherwise memory. The `supabase` backend calls the same migration `00004` functions through `/rpc`, so every reservation is still one atomic database transaction. The service-role key bypasses row-level security, so it belongs in `backend/.env` only.

Live check of the `supabase` backend (writes one CANCELLED exchange, leaves stock unchanged): `MONOLOOP_LIVE_SUPABASE=1 .venv/bin/pytest tests/test_supabase_live.py`

Apply `../supabase/migrations/00001` → `00008` first. The schema lives only in those migrations; `app/repositories/postgres/tables.py` describes it and never alters it. `GET /api/health` reports the active backend and whether the database answers.

## Architecture

```
app/
├── main.py                 app factory: middleware, routers, exception handlers, lifespan
├── core/                   config (pydantic-settings), errors, security (actor/JWT), middleware
├── api/
│   ├── deps.py             composition root: builds repositories + services once (Factory, DI)
│   └── routes/             thin HTTP layer: validate → call service → wrap in the envelope
├── services/               business rules
│   ├── supply.py · demand.py · exchange.py · impact.py
│   ├── matching/           rules (Strategy) → costs → allocation → engine; service; evaluation
│   └── ai/extraction.py    Heuristic / Gemini / OpenAI extractors (Strategy) behind a Facade
│       ai/transcription.py voice fallback: Gemini / OpenAI speech-to-text behind a Facade
├── repositories/
│   ├── base.py             Protocol interfaces (Repository pattern, dependency inversion)
│   ├── memory/             in-process store + exchange state machine (lock = transaction)
│   └── postgres/           SQLAlchemy Core implementation
├── schemas/                Pydantic models: entities, strict inputs, MatchResult, ExchangeView
└── domain/constants.py     controlled vocabularies (same as frontend/src/lib/constants.ts)
```

| Pattern | Where | Why |
| :-- | :-- | :-- |
| Layered architecture (router → service → repository) | everywhere | HTTP, business rules and storage change independently |
| Repository + dependency inversion | `repositories/base.py` | services never know whether data is in Postgres or memory |
| Factory / composition root | `api/deps.py` | one place decides the implementation from settings |
| Dependency injection | FastAPI `Depends` | routers receive services; tests swap anything |
| Strategy | `services/matching/rules.py`, `services/ai/extraction.py` | add a compatibility rule or AI provider without touching callers |
| State machine | `repositories/memory/workflow.py`, migration `00004` | exchange lifecycle with explicit, validated transitions |
| Facade | `ExtractionService` | one call for the router, provider failures become a soft result |
| DTO / schema validation | `schemas/` | strict request models, stable response contract |

## Endpoints

Every response uses the envelope `{ "success", "data", "error": { "code", "message", "details" }, "meta" }`. Write requests identify the acting organization with the `X-Organization-Id` header (the demo organization switcher).

| Method | Path | Owner | Notes |
| :-- | :-- | :-- | :-- |
| GET | `/api/health` | — | backend, database and AI status |
| GET | `/api/organizations` | M1 | demo organizations |
| GET | `/api/listings` | M1 | `organization_id`, `material_family`, `status`, `search` |
| POST | `/api/listings` | M1 | suppliers only; `reserved_quantity` always starts at 0 |
| GET / PATCH | `/api/listings/{id}` | M1 | owner only; `reserved_quantity` never editable; total ≥ reserved |
| GET | `/api/requirements` | M2 | `meta` carries pending/fulfilled exchange statistics |
| POST | `/api/requirements` | M2 | buyers only |
| GET / PATCH | `/api/requirements/{id}` | M2 | owner only; FULFILLED/CANCELLED are immutable (409) |
| GET | `/api/matches` | M3 | every OPEN requirement with its match |
| GET | `/api/matches/{requirement_id}` | M3 | `MatchResult`; 404 unknown, 409 not open |
| GET | `/api/matches/evaluation` | M3 | MONOLOOP vs name-only search on the labelled dataset |
| GET | `/api/exchanges` | M4 | `organization_id` (buyer or supplier), `status` |
| POST | `/api/exchanges` | M4 | `{requirement_id, buyer_organization_id}`; allocation recomputed server-side |
| GET | `/api/exchanges/{id}` | M4 | full read model with items, activity, stage |
| POST | `/api/exchanges/{id}/accept` · `/reject` | M4 | item's supplier; body `{exchange_item_id}` |
| POST | `/api/exchanges/{id}/complete` · `/cancel` | M4 | buyer only |
| GET | `/api/impact` | M4 | only COMPLETED exchanges count as reuse |
| GET / POST | `/api/conversations` | M1 | buyer ↔ supplier chat: the org's chats (`meta.unread_total`) / a buyer opens the chat for `{listing_id}` |
| GET | `/api/conversations/{id}?after_seq=` | M1 | participants only; messages after the polling cursor |
| POST | `/api/conversations/{id}/messages` · `/read` | M1 | `{body}` 1–2000 chars; clear your unread count |
| POST | `/api/ai/extract-material` | M1 | `{prompt, mock?}`; provider failure → `success:false`, `AI_UNAVAILABLE` |
| POST | `/api/ai/transcribe` | M1 | `{audio_base64, mime_type, language: en-US\|bn-BD\|ja-JP}`; voice fallback for browsers without the Web Speech API; own body limit (`MAX_AUDIO_BYTES`); failure → `AI_UNAVAILABLE` |

## Speed and efficiency

- **Fewer round trips.** The Supabase project is in ap-southeast-2, so each database round trip from Bangladesh is expensive.
  - Listing and requirement reads join organizations in one query.
  - The full exchange read model is a single JSON-aggregate query; the old code used 5 PostgREST requests.
  - The `/matches` overview uses 2 queries in total instead of at least 1 + 2·N.
- **Pooled connections.** An async SQLAlchemy pool (`pool_pre_ping`, `pool_recycle`) runs on the Session pooler, and asyncpg's prepared-statement cache stays on.
- **Allocation.** Candidates are sorted once, and each supplier subset is filled in one bitmask scan.
- **Lightweight middleware.** It is pure ASGI, GZip compresses responses over 1 KB, and a shared HTTP client keeps keep-alive connections to the AI provider.
- **Frontend caching.** TanStack Query deduplicates requests, serves cached data instantly, and invalidates exactly the affected queries after a write.
- **Timing.** `Server-Timing` and `X-Request-ID` headers are added to every response, and each request is logged on one access-log line.

## Security

- **Strict input validation.** Request bodies are strict: `"5"` is not a number, and unknown fields are rejected. Values have upper bounds, URLs must be http(s), and IDs must be UUIDs.
- **Server-side ownership rules.** Only the owner can edit a listing or requirement, only the supplier can accept or decline their item, and only the buyer can complete or cancel an exchange. Exchange allocations are never taken from the browser.
- **Atomic stock changes.** Every stock change is one transaction (PL/pgSQL with row locks, or the store lock). Concurrent acceptances cannot over-allocate (test T9).
- **Parameterised SQL everywhere.** `LIKE` wildcards in searches are escaped.
- **CORS.** Allowed only for the configured frontend origins, with explicit methods and headers.
- **Rate limiting.** A per-client limit returns 429 with `Retry-After`, with a stricter limit for writes. For multiple instances, set the same limits at the proxy.
- **Request limits.** The body size is capped (413).
- **Security headers.** Responses send nosniff, frame denial, a strict CSP for JSON, `no-store` and `Referrer-Policy`, plus HSTS in production.
- **No leaked internals.** 500 errors return a generic message; details go only to the server log. API docs are disabled in production.
- **Secrets stay on the server.** The AI key is sent in a header, not the URL, and model output is schema-validated. Supplier text is treated as data in the prompt.
- **Optional real auth.** With `AUTH_MODE=jwt`, Supabase access tokens are verified against `SUPABASE_JWKS_URL` (signature, expiry and audience), and the organization comes from `app_metadata.organization_id`.

## Tests

| File | Covers |
| :-- | :-- |
| `test_engine_parity.py` | the Python engine reproduces the original TypeScript engine output on all 18 recorded cases |
| `test_matching_engine.py` | plan tests T4–T8, rotation, own listings, budgets, optimality against brute force (300 random cases), greedy fallback, evaluation metrics |
| `test_api.py` | T1–T3, T9, every endpoint, the full 50 + 30 exchange flow (stock deducted, requirement FULFILLED, impact), reject/cancel releases stock |
| `test_chat.py` | chat story, polling cursor, inbox/unread, participants only, who may open, never touches stock (memory + optional PostgreSQL) |
| `test_voice.py` | Bangla/Japanese mock extraction, transcription soft failures, strict input, per-route audio body limit |
| `test_security.py` | headers, CORS, rate limit, body limit, UUID identity, injection, error hygiene, JWT mode, production docs |

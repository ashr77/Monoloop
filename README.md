# Meguri — Industrial Surplus Matching & Resource Exchange

> **One industry's surplus. Another's opportunity.**
> Built for the **TSUNAGU Hackathon 2026** (theme: *Update the Way We Connect*).
> Meguri was developed under the working name **MONOLOOP**; the repository, services and some identifiers still use that name.

Factories in Bangladesh end every production run with leftover sheet metal and panels: offcuts, over-ordered stock, cancelled-project inventory. Other manufacturers buy exactly those materials new. Meguri connects the two on **exact technical specification** (grade, dimensions, thickness, condition, available stock), explains every match, splits large requirements across several suppliers at the lowest delivered cost, and carries the deal through reservation, payment and handover — while keeping inventory consistent.

**Live demo:** [monoloop-web.onrender.com](https://monoloop-web.onrender.com) · API health: [monoloop-api.onrender.com/api/health](https://monoloop-api.onrender.com/api/health)
*(Free Render instances sleep after 15 minutes idle; the first request can take about 50 seconds. Open both links before a demo.)*

---

## Contents

1. [Features](#features)
2. [How a trade works](#how-a-trade-works)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Getting started](#getting-started)
6. [Configuration](#configuration)
7. [Database and migrations](#database-and-migrations)
8. [Pages](#pages)
9. [API overview](#api-overview)
10. [Testing and quality checks](#testing-and-quality-checks)
11. [Deployment](#deployment)
12. [Security](#security)
13. [Contributing](#contributing)
14. [Further documentation](#further-documentation)

---

## Features

| Area | What it does |
| :-- | :-- |
| **Surplus marketplace** | Suppliers list stainless-steel sheets and plywood panels with grade, dimensions (mm), thickness, quantity, condition, price (BDT) and city. Everyone can browse the whole marketplace with search, filters, sort, list/grid view and adjustable columns. |
| **AI listing assistant** | Describe the material in plain text or **by voice in English, Bangla or Japanese**; a hosted LLM (Gemini or OpenAI) fills the form. A deterministic offline parser takes over if the AI is unavailable. Every suggestion is reviewed by the user before saving. |
| **Listing photos** | Drag and drop, browse or paste a photo (JPEG, PNG, WebP), or paste a link. Large photos are resized in the browser; files are stored in Supabase Storage. |
| **Buyer requirements** | Buyers post what they need: exact or ranged dimensions, quantity, condition, budget and whether several suppliers may be combined. The AI assistant works here too. |
| **Explainable matching** | Every listing is checked against every mandatory rule (grade, size in either orientation, thickness, condition, available stock, not your own company). The UI shows a full pass/fail breakdown, and an optimal allocation across suppliers ranked by delivered cost (material + transport + handling). |
| **Direct orders** | Order a quantity straight from any listing. |
| **Exchanges** | Request → each supplier accepts or declines → stock is reserved → (optional online payment) → buyer confirms receipt → inventory is deducted. Every stock change is one atomic database transaction, so concurrent orders cannot over-allocate. |
| **Online payment** | SSLCommerz (sandbox in the live demo). The payment is validated server-side with the gateway before it counts. |
| **Chat** | Buyer ↔ supplier messages about a listing, with an unread badge. Messages never change orders, prices or stock. |
| **Notifications** | A bell next to Messages counts unread order and payment events: new orders for your listings, accepted / declined / reserved orders, confirmed transfers, cancellations and verified payments. Clicking one opens that exchange. |
| **Impact** | Material recovered, transferred units and value, counted only from completed exchanges. |
| **Company accounts** | Companies sign up with a trade licence number; a super admin approves, rejects or suspends them. Every approved company can both buy and sell. |
| **Demo mode** | Without logins, "Acting as" switchers let one person play every company. |

## How a trade works

```
Supplier lists surplus ─┐                                   ┌─ Buyer posts a requirement
                        ▼                                   ▼
                  Matching engine: exact spec rules → optimal multi-supplier allocation
                                         │
             Buyer orders a listing or requests the matched allocation
                                         │
                 Each supplier accepts (stock reserved) or declines
                                         │
             (Online payment, if switched on) ──▶ Buyer confirms receipt
                                         │
              Stock deducted · requirement fulfilled · impact recorded
```

Both companies are notified at every step (bell) and can talk in the listing chat.

| Stage | Meaning |
| :-- | :-- |
| Awaiting suppliers | At least one item is still pending. |
| Supplier declined | The exchange cannot complete; the buyer cancels and requests again. |
| Stock reserved | Every item accepted; its stock is held for the buyer. |
| Completed | Inventory deducted; the reuse counts toward Impact. |
| Cancelled | Every reservation released. |

Inventory invariant: **available = total − reserved**. Reserved stock is only ever changed by the exchange workflow.

## Architecture

```
Browser ──▶ Next.js frontend ──▶ FastAPI backend ──▶ Supabase (PostgreSQL + Auth + Storage)
            (UI only, no secrets)  (all rules, AI, payments)        │
                                          ├──▶ Gemini / OpenAI (listing + voice extraction)
                                          └──▶ SSLCommerz (payments)
```

```
component → hook (src/hooks, cached by TanStack Query) → src/lib/api → FastAPI route → service → repository → database
```

```
Monoloop/
├── backend/                FastAPI (Python): every endpoint, matching engine, exchanges, AI, payments, auth
│   ├── app/api/routes/     thin HTTP layer
│   ├── app/services/       business rules (matching/, ai/, payments/, auth/, notifications, storage…)
│   ├── app/repositories/   memory/ · postgres/ · supabase/ implementations of the same interfaces
│   ├── app/schemas/        Pydantic request/response models
│   └── tests/              pytest suite
├── frontend/               Next.js 14 App Router (TypeScript)
│   ├── src/app/            pages
│   ├── src/features/       feature modules (supply, demand, matching, exchanges, chat, notifications, home…)
│   ├── src/components/     shared UI kit (components/ui) and motion helpers
│   ├── src/hooks/          data layer: React Query hooks over one typed API client
│   └── src/lib/            API client, auth session, constants, types
├── supabase/migrations/    the database schema, applied in order (single source of truth)
├── docs/                   module documentation and the design system
├── render.yaml             Render blueprint (API + web)
└── .github/workflows/      deploy to Render on every push to main
```

The backend can run on three interchangeable data backends behind the same repository interfaces:

| Settings | `DATA_BACKEND` | Use |
| :-- | :-- | :-- |
| nothing set | `memory` — seeded from `backend/app/seed/seed_data.json` (9 companies, 7 listings, 6 requirements) | local demo, tests, frontend work |
| `DATABASE_URL` (Supabase Session pooler, port 5432) | `postgres` — SQLAlchemy async + asyncpg | real data with the database password |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `supabase` — Supabase REST (PostgREST) | real data without the database password (used in production) |

`DATA_BACKEND=auto` picks Postgres, then Supabase REST, then memory. Atomic operations run as PL/pgSQL functions in every database mode.

## Tech stack

| Layer | Technology |
| :-- | :-- |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, TanStack Query 5, Framer Motion, Lucide icons, Geist font, Vitest |
| Backend | Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 (async) + asyncpg, httpx, PyJWT, pytest, Ruff |
| Database & storage | Supabase: PostgreSQL (with PL/pgSQL workflow functions and row-level security), Auth, Storage |
| AI | Gemini or OpenAI (configurable), called only from the backend, with an offline fallback parser |
| Payments | SSLCommerz |
| Hosting | Render (two web services), deployed by GitHub Actions |

## Getting started

**Prerequisites:** Python 3.12 or newer, Node.js 20, Git. No database is needed for the demo: the backend serves built-in data from memory.

### 1. Backend — http://localhost:8000 (interactive docs at `/docs`)

macOS / Linux / Git Bash:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt        # Windows Git Bash: .venv/Scripts/pip.exe
cp .env.example .env                                  # optional; empty = in-memory demo data
DATA_BACKEND=memory AUTH_MODE=demo PAYMENT_PROVIDER=none .venv/bin/uvicorn app.main:app --reload --port 8000
```

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements-dev.txt
$env:DATA_BACKEND = "memory"; $env:AUTH_MODE = "demo"; $env:PAYMENT_PROVIDER = "none"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

> Leave out `DATA_BACKEND=memory` to use the database configured in `backend/.env`. **That writes to the real database.**

### 2. Frontend — http://localhost:3000

```bash
cd frontend
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

### 3. Try it

1. Open **Trade → Supplier inventory** and post a listing (try the AI assistant or voice input).
2. Switch the "Acting as" buyer, open the **Marketplace** and order from a listing.
3. Open the **bell** and choose the supplier in its "For" picker: the new order is there. Click it to open the exchange and accept.
4. As the buyer, confirm the transfer, then check **Impact**.

### Troubleshooting

| Problem | Fix |
| :-- | :-- |
| `ChunkLoadError` / page stuck loading | Stop the frontend, delete `frontend/.next` (`Remove-Item -Recurse -Force .next` in PowerShell), run `npm run dev` again and refresh. Don't run two dev servers in the same folder. |
| Port 8000 or 3000 already in use | `netstat -ano \| findstr :8000`, then `taskkill /PID <pid> /F` (Windows). |
| Sign-in page appears instead of the demo | `AUTH_MODE=jwt` is set; use `AUTH_MODE=demo` for the switcher demo. |
| "Cannot reach the API" | Check the backend is running and `NEXT_PUBLIC_API_URL` matches it; the backend's `CORS_ORIGINS` must include the frontend URL. |

## Configuration

### Backend (`backend/.env`, see `backend/.env.example`)

| Variable | Purpose |
| :-- | :-- |
| `ENVIRONMENT` | `development`, `test` or `production` (production hides API docs and enables HSTS) |
| `DATA_BACKEND` | `auto`, `memory`, `postgres` or `supabase` |
| `DATABASE_URL` | Supabase Session pooler URI (Postgres mode) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase REST, Auth and Storage. **Server only — never put the service-role key in the frontend.** |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `AUTH_MODE` | `demo` (Acting-as switchers) or `jwt` (company logins) |
| `SUPABASE_JWKS_URL` | Token verification keys for `jwt` mode |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD`, `BOOTSTRAP_DEMO_PASSWORD` | Offline-only logins when no Supabase is configured |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_TRANSCRIBE_MODEL` | AI extraction and voice transcription |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_ATTEMPTS`, `AI_TOTAL_TIMEOUT_SECONDS`, `MAX_AUDIO_BYTES` | AI retry budget and voice upload size |
| `STORAGE_BUCKET`, `MAX_IMAGE_BYTES`, `UPLOAD_DIR` | Listing photos (Supabase Storage bucket, created on first upload; local folder otherwise) |
| `PAYMENT_PROVIDER` | `none` or `sslcommerz` |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_SANDBOX` | Payment gateway |
| `PUBLIC_API_URL`, `FRONTEND_URL` | Where the gateway sends the browser back |
| `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_WRITES_PER_MINUTE` | Per-client rate limits |

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
| :-- | :-- |
| `NEXT_PUBLIC_API_URL` | Backend URL. The frontend holds **no secrets**; the login mode is read from `GET /api/health`. |

## Database and migrations

Apply every file in `supabase/migrations/` **in order** (Supabase dashboard → SQL editor). Each is safe to re-run. The schema lives only in these files; the backend never alters it.

| Migration | Adds |
| :-- | :-- |
| `00001_initial_schema.sql` | organizations, listings, requirements, exchanges, exchange items, activity logs |
| `00002_seed_demo_data.sql`, `00003_seed_buyer_requirements.sql` | demo companies, listings and requirements |
| `00004_exchange_workflow.sql` | atomic exchange functions (request, accept, decline, complete, cancel) with row locks |
| `00005_requirement_dimension_ranges.sql` | min/max dimension ranges on requirements |
| `00006_direct_listing_orders.sql` | ordering directly from a listing |
| `00007_payments.sql` | payments table (one verified payment per exchange) |
| `00008_listing_chat.sql` | buyer ↔ supplier chat |
| `00009_company_accounts.sql` | company accounts, licence numbers, admin approval |
| `00010_notification_reads.sql` | which notifications each company has read |

Private tables have row-level security enabled with no public policies, so the public Supabase keys cannot read them; only the backend can.

**One-off scripts** (after `00009`, with Supabase configured):

```bash
cd backend
ADMIN_EMAIL=… ADMIN_PASSWORD=… .venv/bin/python -m app.scripts.create_admin           # super admin
DEMO_PASSWORD=… .venv/bin/python -m app.scripts.create_demo_accounts                  # logins for existing companies
```

## Pages

| Route | Page |
| :-- | :-- |
| `/` | Home: live marketplace figures, product walkthrough, how it works |
| `/supply` | Supplier inventory; `?scope=all` is the full marketplace; `?compose=1` opens "post surplus" |
| `/demand` | Buyer requirements and recommendations |
| `/matches`, `/matches/[requirementId]` | Match status for every open requirement; full explanation of one match |
| `/exchanges` | Orders and exchanges with next actions; `?highlight=<id>` opens one |
| `/impact` | Resource-recovery analytics |
| `/messages`, `/messages/[id]` | Chat inbox and conversation |
| `/login`, `/signup`, `/pending`, `/account` | Company accounts |
| `/admin` | Super admin: approve, reject or suspend companies |

## API overview

Interactive documentation: `http://localhost:8000/docs` (disabled in production). Every response uses one envelope:

```json
{ "success": true, "data": …, "error": { "code": "…", "message": "…", "details": … }, "meta": { … } }
```

The acting company comes from the signed-in token (`AUTH_MODE=jwt`) or the `X-Organization-Id` header (demo mode).

| Area | Endpoints |
| :-- | :-- |
| System | `GET /api/health` |
| Supply | `GET /api/organizations` · `GET/POST /api/listings` · `GET/PATCH /api/listings/{id}` · `POST /api/uploads/listing-image` |
| Demand | `GET/POST /api/requirements` · `GET/PATCH /api/requirements/{id}` |
| Matching | `GET /api/matches` · `GET /api/matches/{requirement_id}` · `GET /api/matches/evaluation` |
| Exchanges | `GET/POST /api/exchanges` · `GET /api/exchanges/{id}` · `POST /api/exchanges/{id}/{accept\|reject\|complete\|cancel}` |
| Payments | `POST /api/payments/exchanges/{id}` · `/api/payments/sslcommerz/{success\|fail\|cancel\|ipn}` |
| Impact | `GET /api/impact` |
| Chat | `GET/POST /api/conversations` · `GET /api/conversations/{id}` · `POST /api/conversations/{id}/messages` · `POST /api/conversations/{id}/read` |
| Notifications | `GET /api/notifications` (`meta.unread_total`) · `POST /api/notifications/read` (`{ids}` or `{all: true}`) |
| AI | `POST /api/ai/extract-material` · `POST /api/ai/extract-requirement` · `POST /api/ai/transcribe` |
| Auth | `POST /api/auth/{signup,login,refresh,password}` · `GET /api/auth/me` · `PATCH /api/auth/{application,profile}` |
| Admin | `GET /api/admin/organizations` · `POST /api/admin/organizations/{id}/{approve\|reject\|suspend}` |

## Testing and quality checks

```bash
# Backend
cd backend
.venv/bin/pytest                    # Windows: .venv/Scripts/python.exe -m pytest
.venv/bin/ruff check app tests

# Frontend
cd frontend
npm run test        # Vitest
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # production build
```

- The backend suite covers the matching engine (including optimality against brute force), every endpoint, the full exchange flow and its stock rules, concurrency (no over-allocation), chat, notifications, uploads, voice input, auth, payments and security headers/limits.
- 15 tests are opt-in: live Supabase (`MONOLOOP_LIVE_SUPABASE=1`) and chat on a real PostgreSQL (`MONOLOOP_TEST_DATABASE_URL`).
- Known issue: `test_engine_parity.py` fails on Windows only, because its expected-results file is read with the Windows default encoding instead of UTF-8. It passes on Linux (CI/Render).

## Deployment

- **Render blueprint** (`render.yaml`): `monoloop-api` (FastAPI, `rootDir: backend`) and `monoloop-web` (Next.js, `rootDir: frontend`), both in Singapore. Secret values (`sync: false`) are entered in the Render dashboard.
- **Automatic deploys:** `.github/workflows/deploy-render.yml` calls Render deploy hooks on **every push to `main`**, deploying only the part that changed and waiting until it is healthy. It needs the repository secrets `RENDER_DEPLOY_HOOK_API` and `RENDER_DEPLOY_HOOK_WEB`. It can also be run manually from the Actions tab.
- **Before merging a change that adds a migration,** run that migration in Supabase first: `main` goes live immediately.
- Production uses `DATA_BACKEND=supabase`, SSLCommerz in sandbox mode and Gemini for AI.

## Security

- All business rules, secrets and AI calls live in the backend; the frontend holds no keys.
- Strict request validation (no type coercion, unknown fields rejected, bounded values, UUID ids).
- Ownership enforced on the server: only owners edit listings/requirements, only the item's supplier accepts or declines, only the buyer completes or cancels. Allocations are recomputed server-side, never taken from the browser.
- Every stock change is a single database transaction with row locks.
- Payments are re-validated with the gateway before they count; uploads are checked by file signature, not by the name or declared type.
- CORS allow-list, per-client rate limits, body-size limits, security headers (CSP, nosniff, frame denial, HSTS in production), generic 500 errors, API docs off in production.
- Company logins use Supabase Auth; tokens are verified against the project's signing keys, and approval status is checked on every write.

## Contributing

1. Pull the latest `main`, then create a branch: `feat/…`, `fix/…`, `chore/…` or `docs/…`.
2. Keep changes inside the right layer (route → service → repository; component → hook → API client). New tables or functions go in a **new numbered migration**, never by editing an applied one.
3. Run the backend and frontend checks above.
4. Open a pull request into `main`. Merging deploys to production.

UI work follows the design system in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): Industrial Copper palette (graphite, copper, sand, cream, slate), one font family, few boxes, motion that respects reduced-motion settings.

## Further documentation

| Document | Contents |
| :-- | :-- |
| [backend/README.md](backend/README.md) | Backend architecture, design patterns, performance notes |
| [docs/MATCHING.md](docs/MATCHING.md) | Matching rules, cost model and allocation algorithm |
| [docs/EXCHANGES.md](docs/EXCHANGES.md) | Exchange lifecycle, atomic reservation, impact |
| [docs/CHAT.md](docs/CHAT.md) | Buyer ↔ supplier chat |
| [docs/AUTH.md](docs/AUTH.md) | Company accounts, signup and admin approval |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Colours, typography, components and motion |
| [docs/TEAM_CONTRACTS.md](docs/TEAM_CONTRACTS.md) | Domain vocabulary, units and team module boundaries |

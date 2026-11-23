# MONOLOOP: Industrial Surplus Matching & Resource Exchange Platform

> **TSUNAGU Hackathon 2026**  
> **Tagline:** One Industry's Surplus. Another's Opportunity.

MONOLOOP connects industrial surplus suppliers with manufacturing and assembly businesses seeking production materials. It provides explainable technical compatibility matching, multi-supplier quantity allocation, economic feasibility ranking, and AI-assisted material listing.

---

## 🧱 Project layout

```
Monoloop/
├── backend/     FastAPI (Python): every API endpoint, the matching engine, database access, AI extraction
├── frontend/    Next.js (TypeScript): pages and components only
│   └── src/hooks/   the middle layer: React hooks that call the backend through one typed client
├── supabase/    database migrations (the schema's single source of truth)
└── docs/        team contracts and module documentation
```

```
component  →  hook (src/hooks, cached by TanStack Query)  →  src/lib/api  →  FastAPI  →  service  →  repository  →  PostgreSQL
```

## 🛠️ Tech Stack

- **Backend:** FastAPI, Pydantic v2, SQLAlchemy 2 (async) + asyncpg, pytest. Details: [backend/README.md](backend/README.md)
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, TanStack Query, Vitest
- **Database:** Supabase PostgreSQL
- **AI Engine:** configurable hosted LLM (Gemini / OpenAI) with a deterministic fallback, called only from the backend

---

## 🚀 Getting Started

Run the backend and the frontend in two terminals.

### 1. Backend (http://localhost:8000, API docs at http://localhost:8000/docs)
```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env          # optional: DATABASE_URL, AI_API_KEY
.venv/bin/uvicorn app.main:app --reload --port 8000
```
Without `DATABASE_URL` the backend serves built-in demo data from memory.

### 2. Frontend (http://localhost:3000)
```bash
cd frontend
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

### 3. Tests & checks
```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check app tests
cd frontend && npm run test && npm run typecheck && npm run lint
```

---

## 👥 Architecture & Team Boundaries

Refer to [TEAM_CONTRACTS.md](docs/TEAM_CONTRACTS.md) for full contracts, database migrations, shared types, and module boundaries.

- Backend architecture, endpoints, security: [backend/README.md](backend/README.md)
- Matching engine: [docs/MATCHING.md](docs/MATCHING.md)
- Exchanges, atomic reservation & impact: [docs/EXCHANGES.md](docs/EXCHANGES.md)

**Database:** apply `supabase/migrations/00001` → `00004` in order (`00004_exchange_workflow.sql` adds the atomic exchange functions the backend calls).

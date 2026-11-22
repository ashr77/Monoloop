# MONOLOOP: Industrial Surplus Matching & Resource Exchange Platform

> **TSUNAGU Hackathon 2026**  
> **Tagline:** One Industry's Surplus. Another's Opportunity.

MONOLOOP connects industrial surplus suppliers with manufacturing and assembly businesses seeking production materials. It provides explainable technical compatibility matching, multi-supplier quantity allocation, economic feasibility ranking, and AI-assisted material listing.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (Strict Mode)
- **Styling:** Tailwind CSS, Lucide Icons, shadcn-inspired components
- **Database:** Supabase PostgreSQL
- **Validation:** Zod
- **Testing:** Vitest
- **AI Engine:** Configurable Hosted LLM (Gemini / OpenAI adapter with fallback)

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Provide your Supabase URL & keys and LLM API Key (optional for basic local testing).

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Run Tests & Typechecks
```bash
npm run test
npm run typecheck
npm run build
```

---

## 👥 Architecture & Team Boundaries

Refer to [TEAM_CONTRACTS.md](file:///E:/Monoloop/docs/TEAM_CONTRACTS.md) for full contracts, database migrations, shared types, and module boundaries.

# MONOLOOP Company Accounts (login, signup, admin approval)

One account is one company. A company can both list surplus and post requirements (`organization_type = HYBRID`). It signs up with its trade licence number and cannot trade until a super admin approves it.

```
Signup (company, city, licence no., email, password)
  -> PENDING   (sees only /pending; every write answers 403 ACCOUNT_PENDING)
  -> admin approves on /admin -> APPROVED (trades as itself only)
  -> or rejects with a reason -> REJECTED -> company fixes details -> PENDING again
  -> an approved company can be SUSPENDED (with a reason)
```

## Switching it on

| Where | Setting |
| :-- | :-- |
| Supabase SQL editor | run `supabase/migrations/00009_company_accounts.sql` once |
| Backend (`backend/.env` / Render) | `AUTH_MODE=jwt` |
| Super admin (one-off) | `ADMIN_EMAIL=… ADMIN_PASSWORD=… .venv/bin/python -m app.scripts.create_admin` |

The frontend reads the mode from `GET /api/health` (`auth_mode`), so it needs no configuration. With `AUTH_MODE=demo` everything works as before, using the "Acting as" switchers. That mode is the fallback for demos.

## How it works

| Piece | Where |
| :-- | :-- |
| Login providers (Strategy): Supabase Auth or in-process (tests) | `backend/app/services/auth/provider.py` |
| Signup, login, approval rules | `backend/app/services/auth/service.py` |
| The single gate for every write | `backend/app/core/security.py` (`resolve_actor`) |
| API | `/api/auth/{signup,login,refresh,me,application}`, `/api/admin/organizations[/{id}/{approve,reject,suspend}]` |
| UI | `/login`, `/signup`, `/pending`, `/admin`; `useIdentity()` locks pages to the signed-in company |
| Tests | `backend/tests/test_auth.py` |

- **No verification email.** Accounts are created server-side with the service-role key and are pre-confirmed. The admin's licence check is the gate instead.
- **The company id and role live in the token's `app_metadata`.** Only the server can write it. Approval status is read from the database on every write, so approve, reject and suspend take effect immediately without a new login.
- **Licence number and email are private.** Only the company itself and admins see them. The public organization list shows approved companies only.
- **Admins act for no company:** they review applications and can browse, but cannot trade.
- **Sessions:** the access and refresh tokens are kept in `localStorage`, and the API client refreshes them shortly before expiry.

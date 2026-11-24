# MONOLOOP Buyer ↔ Supplier Chat (Member 1)

A buyer can ask a supplier about a listing before ordering it. The chat contains **messages only**. Ordering is the direct listing order flow: the chat's **Place order** button opens the same `ListingOrderDialog` as the Supply table.

| Item | Location |
| :-- | :-- |
| Database | `supabase/migrations/00007_listing_chat.sql` (run after 00001–00006; safe to re-run) |
| Rules for the in-memory demo store | `backend/app/repositories/memory/chat.py` (mirrors the SQL) |
| Service / API | `backend/app/services/chat.py`, `backend/app/api/routes/chat.py` |
| UI | `/messages` (inbox), `/messages/[id]?as=<orgId>` (chat), **Chat** button on the Supply table |
| Tests | `backend/tests/test_chat.py` (memory, plus PostgreSQL when `MONOLOOP_TEST_DATABASE_URL` is set) |

## Story

1. **Start a chat.** On **Supply**, pick a buyer in **Order as buyer…**, then press **Chat** on an ACTIVE listing. Without a buyer selected, the picker is highlighted instead. There is one chat per (listing, buyer), so pressing Chat again reopens it.
2. **Ask.** The buyer writes a message (Enter sends it, Shift+Enter adds a new line).
3. **Get notified.** The supplier sees an unread badge on **Messages** in the navbar, and the chat in its inbox (pick the supplier in **Signed in as**).
4. **Reply.** New messages appear within about 3 seconds. Polling only fetches messages after the last one shown (`after_seq`), and it pauses in background tabs.
5. **Order.** The buyer presses **Place order** in the chat. This opens the direct-order dialog. After the order is placed, the chat posts "I've placed an order request for N pcs…", and the supplier accepts or rejects it on **Exchanges** as usual.

For demos, **Viewing as** on the chat page switches between the buyer and the supplier.

## API

Identity: `X-Organization-Id` (demo) or the JWT organization. Everything is for **participants only**.

| Method | Path | Notes |
| :-- | :-- | :-- |
| GET | `/api/conversations` | the org's chats, newest first; `meta.unread_total` |
| POST | `/api/conversations` | `{listing_id}`; buyers (`BUYER`/`HYBRID`) only, ACTIVE listing, not your own; get-or-create |
| GET | `/api/conversations/{id}?after_seq=N` | messages with `seq > N`, plus `last_seq` |
| POST | `/api/conversations/{id}/messages?after_seq=N` | `{body}` (1–2000 chars, trimmed) |
| POST | `/api/conversations/{id}/read` | clears your unread count |

## Rules

- **Who can start a chat:** only buyer organizations. An archived or completed listing can't start a new chat, but an existing chat about it still opens.
- **Who can read or write:** only the two companies in the chat. Everyone else gets `403 FORBIDDEN_ORGANIZATION`.
- **What the chat changes:** never orders, prices or stock (there's a test for this).
- **Privacy:** both tables have Row Level Security on, with no policies, and the functions are revoked from `anon`/`authenticated`. The public Supabase keys can't read the chats; only the backend can.

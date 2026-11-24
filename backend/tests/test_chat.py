"""Buyer ↔ supplier chat about a listing.

Every test runs through the HTTP API on the in-memory backend and, when
MONOLOOP_TEST_DATABASE_URL points at a disposable PostgreSQL with migrations 00001-00008 applied,
again on the postgres backend (the PL/pgSQL rules). That database is reset before each test.

    docker run -d --rm --name monoloop-pgtest -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
    for f in ../supabase/migrations/0000*.sql; do docker exec -i monoloop-pgtest psql -U postgres -q < $f; done
    MONOLOOP_TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/postgres pytest tests/test_chat.py
"""

from __future__ import annotations

import asyncio
import os

import httpx
import pytest
from sqlalchemy import text

from app.api.deps import build_container
from app.main import create_app
from tests.conftest import BUYER_APEX, BUYER_DELTA, SUP_DHAKA, SUP_GAZIPUR, as_org, make_settings

LISTING = "c1111111-1111-4111-c111-111111111111"  # Gazipur Metal Works: SS304
OTHER_LISTING = "c2222222-2222-4222-c222-222222222222"  # Dhaka Precision Steel: SS304
UNKNOWN = "00000000-0000-4000-8000-000000000000"
PG_URL = os.environ.get("MONOLOOP_TEST_DATABASE_URL", "")


@pytest.fixture(params=["memory", "postgres"])
async def api(request):
    if request.param == "postgres" and not PG_URL:
        pytest.skip("set MONOLOOP_TEST_DATABASE_URL to run the chat rules against PostgreSQL")
    extra = {"data_backend": "postgres", "database_url": PG_URL} if request.param == "postgres" else {}
    settings = make_settings(**extra)
    app = create_app(settings)
    container = build_container(settings)
    if container.engine is not None:
        async with container.engine.begin() as conn:
            await conn.execute(text("TRUNCATE listing_messages, listing_conversations CASCADE"))
            await conn.execute(text("UPDATE listings SET status = 'ACTIVE' WHERE id = CAST(:id AS uuid)"), {"id": LISTING})
    app.state.container = container
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await container.aclose()


def data(r: httpx.Response):
    body = r.json()
    assert body["success"], body
    return body["data"]


def error(r: httpx.Response) -> str:
    body = r.json()
    assert body["success"] is False, body
    return body["error"]["code"]


async def open_chat(api, buyer=BUYER_APEX, listing=LISTING) -> dict:
    r = await api.post("/api/conversations", json={"listing_id": listing}, headers=as_org(buyer))
    assert r.status_code == 201, r.json()
    return data(r)


async def say(api, cid, org, body, after_seq=0) -> dict:
    r = await api.post(f"/api/conversations/{cid}/messages?after_seq={after_seq}", json={"body": body},
                       headers=as_org(org))
    assert r.status_code == 201, r.json()
    return data(r)


async def inbox(api, org) -> dict:
    return (await api.get("/api/conversations", headers=as_org(org))).json()


# --------------------------------------------------------------------------- the story


async def test_buyer_asks_supplier_replies(api):
    conv = await open_chat(api)
    assert conv["role"] == "BUYER" and conv["counterpart"]["id"] == SUP_GAZIPUR
    assert conv["listing"]["id"] == LISTING and conv["messages"] == [] and conv["unread"] == 0
    assert (await open_chat(api))["id"] == conv["id"]  # one chat per (listing, buyer)
    cid = conv["id"]

    after = await say(api, cid, BUYER_APEX, "  Are the edges clean?  ")
    assert after["messages"][-1]["body"] == "Are the edges clean?"
    assert after["messages"][-1]["sender_organization_id"] == BUYER_APEX

    box = await inbox(api, SUP_GAZIPUR)
    assert box["meta"]["unread_total"] == 1
    row = box["data"][0]
    assert row["id"] == cid and row["role"] == "SUPPLIER" and row["counterpart"]["id"] == BUYER_APEX
    assert row["unread"] == 1 and row["last_message_preview"] == "Are the edges clean?"
    assert (await inbox(api, BUYER_APEX))["meta"]["unread_total"] == 0  # the sender has nothing unread

    seen = data(await api.get(f"/api/conversations/{cid}", headers=as_org(SUP_GAZIPUR)))
    assert seen["role"] == "SUPPLIER" and [m["body"] for m in seen["messages"]] == ["Are the edges clean?"]
    data(await api.post(f"/api/conversations/{cid}/read", headers=as_org(SUP_GAZIPUR)))
    assert (await inbox(api, SUP_GAZIPUR))["meta"]["unread_total"] == 0

    await say(api, cid, SUP_GAZIPUR, "Yes, factory-wrapped.")
    assert (await inbox(api, BUYER_APEX))["meta"]["unread_total"] == 1
    full = data(await api.get(f"/api/conversations/{cid}", headers=as_org(BUYER_APEX)))
    assert [(m["sender_organization_id"], m["body"]) for m in full["messages"]] == [
        (BUYER_APEX, "Are the edges clean?"), (SUP_GAZIPUR, "Yes, factory-wrapped."),
    ]


async def test_polling_returns_only_new_messages(api):
    cid = (await open_chat(api))["id"]
    first = await say(api, cid, BUYER_APEX, "one")
    cursor = first["last_seq"]
    assert cursor == first["messages"][-1]["seq"]
    idle = data(await api.get(f"/api/conversations/{cid}?after_seq={cursor}", headers=as_org(BUYER_APEX)))
    assert idle["messages"] == [] and idle["last_seq"] == cursor
    await say(api, cid, SUP_GAZIPUR, "two")
    await say(api, cid, SUP_GAZIPUR, "three")
    new = data(await api.get(f"/api/conversations/{cid}?after_seq={cursor}", headers=as_org(BUYER_APEX)))
    assert [m["body"] for m in new["messages"]] == ["two", "three"] and new["last_seq"] > cursor


async def test_inbox_lists_each_chat_newest_first(api):
    a = (await open_chat(api, BUYER_APEX))["id"]
    d = (await open_chat(api, BUYER_DELTA))["id"]
    other = (await open_chat(api, BUYER_APEX, OTHER_LISTING))["id"]
    await say(api, a, BUYER_APEX, "from Apex")
    await say(api, d, BUYER_DELTA, "from Delta")
    rows = (await inbox(api, SUP_GAZIPUR))["data"]
    assert [r["id"] for r in rows] == [d, a]  # Gazipur only sees its own listings' chats
    assert {r["counterpart"]["id"] for r in rows} == {BUYER_APEX, BUYER_DELTA}
    assert [r["id"] for r in (await inbox(api, SUP_DHAKA))["data"]] == [other]
    assert len((await inbox(api, BUYER_APEX))["data"]) == 2


async def test_concurrent_opens_create_one_chat(api):
    results = await asyncio.gather(*(api.post("/api/conversations", json={"listing_id": LISTING},
                                              headers=as_org(BUYER_APEX)) for _ in range(5)))
    assert len({data(r)["id"] for r in results}) == 1


# --------------------------------------------------------------------------- access control


async def test_only_participants_can_read_or_write(api):
    cid = (await open_chat(api))["id"]
    for org in (BUYER_DELTA, SUP_DHAKA):
        assert error(await api.get(f"/api/conversations/{cid}", headers=as_org(org))) == "FORBIDDEN_ORGANIZATION"
        r = await api.post(f"/api/conversations/{cid}/messages", json={"body": "hi"}, headers=as_org(org))
        assert r.status_code == 403 and error(r) == "FORBIDDEN_ORGANIZATION"
        assert error(await api.post(f"/api/conversations/{cid}/read", headers=as_org(org))) == "FORBIDDEN_ORGANIZATION"
        assert (await inbox(api, org))["data"] == []
    assert error(await api.get(f"/api/conversations/{cid}")) == "ACTOR_REQUIRED"
    assert error(await api.get(f"/api/conversations/{UNKNOWN}", headers=as_org(BUYER_APEX))) == "NOT_FOUND"
    assert error(await api.get("/api/conversations/not-a-uuid", headers=as_org(BUYER_APEX))) == "NOT_FOUND"


async def test_who_can_start_a_chat(api):
    r = await api.post("/api/conversations", json={"listing_id": LISTING}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 403 and error(r) == "FORBIDDEN_ROLE"
    r = await api.post("/api/conversations", json={"listing_id": LISTING}, headers=as_org(SUP_DHAKA))
    assert error(r) == "FORBIDDEN_ROLE"  # suppliers do not buy through chat
    assert error(await api.post("/api/conversations", json={"listing_id": UNKNOWN},
                                headers=as_org(BUYER_APEX))) == "NOT_FOUND"


async def test_archived_listing_blocks_new_chats_but_keeps_old_ones(api):
    cid = (await open_chat(api, BUYER_APEX))["id"]
    await api.patch(f"/api/listings/{LISTING}", json={"status": "ARCHIVED"}, headers=as_org(SUP_GAZIPUR))
    r = await api.post("/api/conversations", json={"listing_id": LISTING}, headers=as_org(BUYER_DELTA))
    assert r.status_code == 409 and error(r) == "LISTING_UNAVAILABLE"
    assert (await open_chat(api, BUYER_APEX))["id"] == cid  # an existing chat can still be reopened
    await say(api, cid, BUYER_APEX, "still there?")


async def test_chat_never_touches_stock_or_exchanges(api):
    before = data(await api.get(f"/api/listings/{LISTING}"))
    cid = (await open_chat(api))["id"]
    await say(api, cid, BUYER_APEX, "I'd like 30 sheets")
    after = data(await api.get(f"/api/listings/{LISTING}"))
    assert (after["total_quantity"], after["reserved_quantity"]) == (before["total_quantity"], before["reserved_quantity"])
    assert data(await api.get("/api/exchanges", params={"organization_id": BUYER_APEX})) == []


# --------------------------------------------------------------------------- input validation


@pytest.mark.parametrize("body", [
    {"body": "   "},
    {"body": "x" * 2001},
    {"body": 5},
    {"body": "hi", "sender_organization_id": BUYER_APEX},
    {},
])
async def test_rejects_bad_messages(api, body):
    cid = (await open_chat(api))["id"]
    r = await api.post(f"/api/conversations/{cid}/messages", json=body, headers=as_org(BUYER_APEX))
    assert r.status_code == 400 and error(r) == "VALIDATION_ERROR"


async def test_rejects_bad_open_and_cursor(api):
    assert error(await api.post("/api/conversations", json={"listing_id": "nope"},
                                headers=as_org(BUYER_APEX))) == "VALIDATION_ERROR"
    cid = (await open_chat(api))["id"]
    assert error(await api.get(f"/api/conversations/{cid}?after_seq=-1", headers=as_org(BUYER_APEX))) == "VALIDATION_ERROR"

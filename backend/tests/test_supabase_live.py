"""Live check against the real Supabase project (opt-in, writes data).

Runs only with:  MONOLOOP_LIVE_SUPABASE=1 .venv/bin/pytest tests/test_supabase_live.py
and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env.

Safe flow: request -> both suppliers accept (stock reserved) -> buyer cancels (stock released).
Listing quantities end exactly where they started; one CANCELLED exchange record remains.
"""

from __future__ import annotations

import os

import httpx
import pytest

from app.api.deps import build_container
from app.core.config import Settings
from app.main import create_app
from tests.conftest import BUYER_APEX, SEED_REQ, as_org

pytestmark = pytest.mark.skipif(os.getenv("MONOLOOP_LIVE_SUPABASE") != "1", reason="live Supabase test is opt-in")


@pytest.fixture
async def live_client():
    settings = Settings(environment="test", data_backend="supabase",
                        rate_limit_per_minute=10_000, rate_limit_writes_per_minute=10_000)
    if not settings.supabase_rest_configured:
        pytest.skip("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    app = create_app(settings)
    app.state.container = build_container(settings)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await app.state.container.aclose()


async def _listing(client, listing_id: str) -> dict:
    return (await client.get(f"/api/listings/{listing_id}")).json()["data"]


async def test_live_request_accept_cancel_restores_stock(live_client):
    c = live_client
    health = (await c.get("/api/health")).json()["data"]
    assert health["data_backend"] == "supabase" and health["database"] == "ok"

    created = await c.post("/api/exchanges", json={"requirement_id": SEED_REQ, "buyer_organization_id": BUYER_APEX},
                           headers=as_org(BUYER_APEX))
    if created.status_code == 409:
        pytest.skip(f"seed requirement not available: {created.json()['error']['code']}")
    assert created.status_code == 201, created.text
    ex = created.json()["data"]
    try:
        before = {i["listing_id"]: await _listing(c, i["listing_id"]) for i in ex["items"]}

        for item in ex["items"]:
            r = await c.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": item["id"]},
                             headers=as_org(item["supplier_organization_id"]))
            assert r.status_code == 200, r.text
        assert r.json()["data"]["stage"] == "RESERVED"

        for item in ex["items"]:
            after = await _listing(c, item["listing_id"])
            assert after["reserved_quantity"] == before[item["listing_id"]]["reserved_quantity"] + item["quantity"]

        # Accepting the same item again must not reserve twice.
        again = await c.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": ex["items"][0]["id"]},
                             headers=as_org(ex["items"][0]["supplier_organization_id"]))
        assert again.status_code == 409
    finally:
        cancel = await c.post(f"/api/exchanges/{ex['id']}/cancel", headers=as_org(BUYER_APEX))
        assert cancel.status_code in (200, 409), cancel.text

    assert cancel.json()["data"]["stage"] == "CANCELLED"
    for listing_id, original in before.items():
        now = await _listing(c, listing_id)
        assert (now["total_quantity"], now["reserved_quantity"]) == (original["total_quantity"], original["reserved_quantity"])

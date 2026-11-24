"""Notification bell: who is told about which order and payment events, and read state."""

from __future__ import annotations

from app.schemas.payment import PaymentRecord
from tests.conftest import BUYER_APEX, BUYER_DELTA, SEED_REQ, SUP_DHAKA, SUP_GAZIPUR, as_org

LISTING_GAZIPUR = "c1111111-1111-4111-c111-111111111111"  # SS304 2400×1200×2, ৳4,200


async def feed(client, org: str) -> tuple[list[dict], int]:
    r = await client.get("/api/notifications", headers=as_org(org))
    assert r.status_code == 200, r.text
    body = r.json()
    return body["data"], body["meta"]["unread_total"]


async def order(client, buyer: str, qty: int = 5) -> dict:
    r = await client.post("/api/exchanges", json={"listing_id": LISTING_GAZIPUR, "quantity": qty,
                                                 "buyer_organization_id": buyer}, headers=as_org(buyer))
    assert r.status_code == 201, r.text
    return r.json()["data"]


async def test_requires_acting_organization(client):
    r = await client.get("/api/notifications")
    assert r.status_code == 400 and r.json()["error"]["code"] == "ACTOR_REQUIRED"


async def test_direct_order_lifecycle_notifies_the_other_side_only(client):
    assert await feed(client, SUP_GAZIPUR) == ([], 0)
    ex = await order(client, BUYER_APEX, 5)

    # Supplier is told about the new order; the buyer is not told about their own action.
    items, unread = await feed(client, SUP_GAZIPUR)
    assert unread == 1 and items[0]["kind"] == "ORDER_RECEIVED" and items[0]["exchange_id"] == ex["id"]
    assert "Apex" in items[0]["title"] and items[0]["message"].startswith("5 pcs · SS304 2,400×1,200×2 mm")
    assert "৳21,000" in items[0]["message"]
    assert await feed(client, BUYER_APEX) == ([], 0)
    assert await feed(client, SUP_DHAKA) == ([], 0)  # not part of this order

    # Accepting a one-item order sends one "reserved" notification to the buyer.
    item_id = ex["items"][0]["id"]
    r = await client.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": item_id},
                          headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 200
    items, unread = await feed(client, BUYER_APEX)
    assert [n["kind"] for n in items] == ["ORDER_RESERVED"] and unread == 1
    assert "Gazipur" in items[0]["title"] and "confirm the transfer" in items[0]["message"]

    # The buyer confirms the transfer: the supplier hears about it.
    r = await client.post(f"/api/exchanges/{ex['id']}/complete", headers=as_org(BUYER_APEX))
    assert r.status_code == 200
    items, unread = await feed(client, SUP_GAZIPUR)
    assert [n["kind"] for n in items] == ["ORDER_COMPLETED", "ORDER_RECEIVED"] and unread == 2


async def test_decline_and_cancel(client):
    ex = await order(client, BUYER_DELTA, 3)
    item_id = ex["items"][0]["id"]
    await client.post(f"/api/exchanges/{ex['id']}/reject", json={"exchange_item_id": item_id},
                      headers=as_org(SUP_GAZIPUR))
    items, _ = await feed(client, BUYER_DELTA)
    assert items[0]["kind"] == "ITEM_DECLINED" and "declined" in items[0]["title"]

    ex2 = await order(client, BUYER_DELTA, 2)
    await client.post(f"/api/exchanges/{ex2['id']}/cancel", headers=as_org(BUYER_DELTA))
    items, _ = await feed(client, SUP_GAZIPUR)
    assert items[0]["kind"] == "ORDER_CANCELLED" and items[0]["exchange_id"] == ex2["id"]
    assert not any(n["kind"] == "ORDER_CANCELLED" for n in (await feed(client, BUYER_DELTA))[0])


async def test_multi_supplier_exchange(client):
    r = await client.post("/api/exchanges", json={"requirement_id": SEED_REQ, "buyer_organization_id": BUYER_APEX},
                          headers=as_org(BUYER_APEX))
    assert r.status_code == 201, r.text
    ex = r.json()["data"]
    suppliers = {i["supplier_organization_id"] for i in ex["items"]}
    assert len(suppliers) == 2
    for s in suppliers:
        items, _ = await feed(client, s)
        assert items[0]["kind"] == "ORDER_RECEIVED"
        own_qty = sum(i["quantity"] for i in ex["items"] if i["supplier_organization_id"] == s)
        assert items[0]["message"].startswith(f"{own_qty} pcs")  # only that supplier's part

    first = ex["items"][0]
    await client.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": first["id"]},
                      headers=as_org(first["supplier_organization_id"]))
    items, _ = await feed(client, BUYER_APEX)
    assert [n["kind"] for n in items] == ["ITEM_ACCEPTED"]
    second = ex["items"][1]
    await client.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": second["id"]},
                      headers=as_org(second["supplier_organization_id"]))
    items, _ = await feed(client, BUYER_APEX)
    assert [n["kind"] for n in items][:1] == ["ORDER_RESERVED"] and len(items) == 3
    assert items[0]["title"] == "All suppliers accepted your order"


async def test_mark_read_one_and_all(client):
    await order(client, BUYER_APEX, 1)
    await order(client, BUYER_DELTA, 1)
    items, unread = await feed(client, SUP_GAZIPUR)
    assert unread == 2

    r = await client.post("/api/notifications/read", json={"ids": [items[0]["id"]]}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 200 and r.json()["data"]["unread_total"] == 1
    items, unread = await feed(client, SUP_GAZIPUR)
    assert unread == 1 and items[0]["read"] is True and items[1]["read"] is False

    # Read state is per organization: someone else's ids are ignored.
    r = await client.post("/api/notifications/read", json={"ids": [items[1]["id"]]}, headers=as_org(SUP_DHAKA))
    assert r.status_code == 200
    assert (await feed(client, SUP_GAZIPUR))[1] == 1

    r = await client.post("/api/notifications/read", json={"all": True}, headers=as_org(SUP_GAZIPUR))
    assert r.json()["data"]["unread_total"] == 0
    assert (await feed(client, SUP_GAZIPUR))[1] == 0


async def test_mark_read_validation(client):
    r = await client.post("/api/notifications/read", json={"ids": ["bad id; drop"]}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 400
    r = await client.post("/api/notifications/read", json={"ids": ["x"] * 201}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 400


async def test_payment_received_notifies_supplier(client, store, app):
    ex = await order(client, BUYER_APEX, 2)
    store.payments["MLPTEST1"] = PaymentRecord(
        id="p1", exchange_id=ex["id"], payer_organization_id=BUYER_APEX, tran_id="MLPTEST1",
        amount_bdt=8400, status="PAID", paid_at="2099-01-01T00:00:00Z",
        created_at="2099-01-01T00:00:00Z", updated_at="2099-01-01T00:00:00Z",
    )
    app.state.container.payments.gateway = object()  # online payment switched on (no real gateway is called)
    items, _ = await feed(client, SUP_GAZIPUR)
    assert items[0]["kind"] == "PAYMENT_RECEIVED" and items[0]["id"] == "payment:MLPTEST1"
    assert items[0]["title"].endswith("paid ৳8,400")
    assert all(n["kind"] != "PAYMENT_RECEIVED" for n in (await feed(client, BUYER_APEX))[0])


async def test_supabase_read_state_requests():
    import json

    import httpx

    from app.repositories.supabase.repositories import SupabaseNotificationReadRepository

    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(200, json=[{"notification_id": "payment:MLP1"}])
        return httpx.Response(201)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://p.supabase.co/rest/v1") as c:
        repo = SupabaseNotificationReadRepository(c)
        got = await repo.read_ids(SUP_GAZIPUR, ["payment:MLP1", "d1111111-1111-4111-d111-111111111111"])
        assert got == {"payment:MLP1"}
        q = seen[0].url.params
        assert q["organization_id"] == f"eq.{SUP_GAZIPUR}"
        assert q["notification_id"] == 'in.("payment:MLP1","d1111111-1111-4111-d111-111111111111")'

        await repo.mark_read(SUP_GAZIPUR, ["payment:MLP1"])
        post = seen[1]
        assert post.method == "POST" and post.url.params["on_conflict"] == "organization_id,notification_id"
        assert "ignore-duplicates" in post.headers["prefer"]
        assert json.loads(post.content) == [{"organization_id": SUP_GAZIPUR, "notification_id": "payment:MLP1"}]

        assert await repo.read_ids("not-a-uuid", ["x"]) == set() and len(seen) == 2

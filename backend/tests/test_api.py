"""HTTP contract tests for every module (in-memory backend, same envelope as the Next.js API)."""

from __future__ import annotations

import asyncio

from tests.conftest import (
    BUYER_APEX,
    BUYER_DELTA,
    REQ_NO_STOCK,
    REQ_OVER_BUDGET,
    REQ_PLY,
    SEED_REQ,
    SUP_GAZIPUR,
    as_org,
)

NEW_LISTING = {
    "organization_id": SUP_GAZIPUR, "material_family": "STAINLESS_STEEL_SHEET", "material_specification": "SS304",
    "length_mm": 2400, "width_mm": 1200, "thickness_mm": 1.5, "total_quantity": 40, "condition": "UNUSED",
    "unit_price_bdt": 4100, "city": "Gazipur",
}
NEW_REQ = {
    "organization_id": BUYER_APEX, "material_family": "STAINLESS_STEEL_SHEET", "material_specification": "SS304",
    "length_mm": 2400, "width_mm": 1200, "thickness_mm": 1.5, "required_quantity": 60, "quantity_unit": "PIECE",
    "maximum_budget_bdt": None, "allow_split_suppliers": True,
}


# --------------------------------------------------------------------------- supply (Member 1)


async def test_t1_create_listing(client):
    r = await client.post("/api/listings", json=NEW_LISTING, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 201
    body = r.json()["data"]
    assert body["reserved_quantity"] == 0 and body["available_quantity"] == 40
    assert body["organization"]["id"] == SUP_GAZIPUR


async def test_t2_negative_quantity_is_validation_error(client):
    r = await client.post("/api/listings", json={**NEW_LISTING, "total_quantity": -5}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_listing_rules(client):
    # wrong family/spec pair, string numbers, unknown fields
    for bad in ({"material_specification": "PLYWOOD_MARINE"}, {"length_mm": "2400"}, {"hack": 1}):
        r = await client.post("/api/listings", json={**NEW_LISTING, **bad}, headers=as_org(SUP_GAZIPUR))
        assert r.status_code == 400, bad
    # buyers cannot publish supply
    r = await client.post("/api/listings", json={**NEW_LISTING, "organization_id": BUYER_APEX}, headers=as_org(BUYER_APEX))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN_ROLE"
    # cannot publish for someone else
    r = await client.post("/api/listings", json=NEW_LISTING, headers=as_org(BUYER_APEX))
    assert r.json()["error"]["code"] == "FORBIDDEN_ORGANIZATION"


async def test_listing_update_guards(client):
    lid = (await client.post("/api/listings", json=NEW_LISTING, headers=as_org(SUP_GAZIPUR))).json()["data"]["id"]
    r = await client.patch(f"/api/listings/{lid}", json={"reserved_quantity": 0}, headers=as_org(SUP_GAZIPUR))
    assert r.json()["error"]["code"] == "FORBIDDEN_FIELD"
    r = await client.patch(f"/api/listings/{lid}", json={"status": "ARCHIVED"}, headers=as_org(BUYER_APEX))
    assert r.status_code == 403
    r = await client.patch(f"/api/listings/{lid}", json={"status": "ARCHIVED"})
    assert r.json()["error"]["code"] == "ACTOR_REQUIRED"
    r = await client.patch(f"/api/listings/{lid}", json={**NEW_LISTING, "unit_price_bdt": 3900}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 200 and r.json()["data"]["unit_price_bdt"] == 3900


async def test_listing_filters_and_404(client):
    r = await client.get("/api/listings", params={"material_family": "PLYWOOD_PANEL", "search": "dhaka"})
    assert r.status_code == 200
    assert all(l["material_family"] == "PLYWOOD_PANEL" for l in r.json()["data"])
    assert (await client.get("/api/listings/not-a-uuid")).status_code == 404
    assert len((await client.get("/api/organizations")).json()["data"]) >= 6


# --------------------------------------------------------------------------- demand (Member 2)


async def test_t3_create_requirement(client):
    r = await client.post("/api/requirements", json=NEW_REQ, headers=as_org(BUYER_APEX))
    assert r.status_code == 201 and r.json()["data"]["status"] == "OPEN"
    r = await client.get("/api/requirements", params={"organization_id": BUYER_APEX})
    meta = r.json()["meta"]
    assert meta["total"] >= 1 and "pending_match_requirement_ids" in meta


async def test_requirement_optional_dimension_ranges(client):
    range_req = {
        "organization_id": BUYER_APEX,
        "material_family": "STAINLESS_STEEL_SHEET",
        "material_specification": "SS304",
        "length_min_mm": 1500,
        "length_max_mm": 2000,
        "width_min_mm": None,
        "width_max_mm": None,
        "thickness_min_mm": 2,
        "thickness_max_mm": 3,
        "required_quantity": 100,
        "quantity_unit": "PIECE",
    }
    created = await client.post("/api/requirements", json=range_req, headers=as_org(BUYER_APEX))
    assert created.status_code == 201
    data = created.json()["data"]
    assert data["length_min_mm"] == 1500 and data["length_max_mm"] == 2000
    assert data["width_min_mm"] is None and data["width_max_mm"] is None

    for bad in (
        {**range_req, "length_min_mm": 2100, "length_max_mm": 2000},
        {**range_req, "length_min_mm": None, "length_max_mm": 2000},
        {**range_req, "length_mm": 1500, "length_min_mm": 1500, "length_max_mm": 2000},
        {**range_req, "required_quantity": 0},
    ):
        assert (await client.post("/api/requirements", json=bad, headers=as_org(BUYER_APEX))).status_code == 400


async def test_requirement_update_rules(client):
    r = await client.patch(f"/api/requirements/{SEED_REQ}", json={"required_quantity": 70}, headers=as_org(BUYER_DELTA))
    assert r.status_code == 403
    r = await client.patch(f"/api/requirements/{SEED_REQ}", json={"status": "CANCELLED"}, headers=as_org(BUYER_APEX))
    assert r.status_code == 200
    r = await client.patch(f"/api/requirements/{SEED_REQ}", json={"status": "OPEN"}, headers=as_org(BUYER_APEX))
    assert r.status_code == 409 and r.json()["error"]["code"] == "IMMUTABLE_STATUS"


async def test_recommendation_match_for_created_requirement(client):
    created = await client.post(
        "/api/requirements",
        json={**NEW_REQ, "length_mm": 2400, "width_mm": 1200, "thickness_mm": 2},
        headers=as_org(BUYER_APEX),
    )
    requirement_id = created.json()["data"]["id"]
    matched = await client.get(f"/api/matches/{requirement_id}", headers=as_org(BUYER_APEX))
    assert matched.status_code == 200
    result = matched.json()["data"]
    assert result["evaluations"]
    assert all(e["compatible"] or e["compatible"] is False for e in result["evaluations"])
    assert sum(e["available_quantity"] for e in result["evaluations"] if e["compatible"]) > 0
    assert matched.json()["meta"]["requirement"]["id"] == requirement_id

    denied = await client.get(f"/api/matches/{requirement_id}", headers=as_org(BUYER_DELTA))
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "FORBIDDEN_ORGANIZATION"


async def test_partial_and_over_budget_recommendations_remain_visible(client):
    partial = await client.post(
        "/api/requirements",
        json={
            **NEW_REQ,
            "length_mm": 2400,
            "width_mm": 1200,
            "thickness_mm": 2,
            "required_quantity": 500,
            "maximum_budget_bdt": 1,
        },
        headers=as_org(BUYER_APEX),
    )
    requirement_id = partial.json()["data"]["id"]
    matched_response = await client.get(f"/api/matches/{requirement_id}", headers=as_org(BUYER_APEX))
    assert matched_response.status_code == 200
    matched = matched_response.json()["data"]
    compatible = [e for e in matched["evaluations"] if e["compatible"]]
    assert compatible
    assert matched["budget"]["status"] == "OVER_BUDGET"
    assert matched["over_budget_alternative"]


# --------------------------------------------------------------------------- direct listing orders


async def test_direct_listing_order_success_and_validation(client):
    listing_id = "c1111111-1111-4111-c111-111111111111"
    order = await client.post(
        "/api/exchanges",
        json={"listing_id": listing_id, "quantity": 10, "buyer_organization_id": BUYER_APEX},
        headers=as_org(BUYER_APEX),
    )
    assert order.status_code == 201
    exchange = order.json()["data"]
    assert exchange["requirement_id"] is None
    assert exchange["items"][0]["quantity"] == 10
    assert exchange["items"][0]["status"] == "PENDING"
    assert exchange["items"][0]["unit_price_bdt"] == 4200

    for quantity in (0, -1):
        bad = await client.post(
            "/api/exchanges",
            json={"listing_id": listing_id, "quantity": quantity, "buyer_organization_id": BUYER_APEX},
            headers=as_org(BUYER_APEX),
        )
        assert bad.status_code == 400

    too_many = await client.post(
        "/api/exchanges",
        json={"listing_id": listing_id, "quantity": 1000, "buyer_organization_id": BUYER_DELTA},
        headers=as_org(BUYER_DELTA),
    )
    assert too_many.status_code == 409
    assert too_many.json()["error"]["code"] == "INSUFFICIENT_STOCK"


async def test_direct_listing_order_ownership_and_accept_reject(client):
    listing_id = "c1111111-1111-4111-c111-111111111111"
    own = await client.post(
        "/api/exchanges",
        json={"listing_id": listing_id, "quantity": 5, "buyer_organization_id": SUP_GAZIPUR},
        headers=as_org(SUP_GAZIPUR),
    )
    assert own.status_code == 400

    order = await client.post(
        "/api/exchanges",
        json={"listing_id": listing_id, "quantity": 12, "buyer_organization_id": BUYER_DELTA},
        headers=as_org(BUYER_DELTA),
    )
    assert order.status_code == 201
    exchange = order.json()["data"]
    item = exchange["items"][0]

    accepted = await client.post(
        f"/api/exchanges/{exchange['id']}/accept",
        json={"exchange_item_id": item["id"]},
        headers=as_org(SUP_GAZIPUR),
    )
    assert accepted.status_code == 200
    assert accepted.json()["data"]["items"][0]["status"] == "ACCEPTED"

    rejected_listing = "c2222222-2222-4222-c222-222222222222"
    rejected = await client.post(
        "/api/exchanges",
        json={"listing_id": rejected_listing, "quantity": 8, "buyer_organization_id": BUYER_APEX},
        headers=as_org(BUYER_APEX),
    )
    assert rejected.status_code == 201
    rejected_exchange = rejected.json()["data"]
    rejected_item = rejected_exchange["items"][0]
    declined = await client.post(
        f"/api/exchanges/{rejected_exchange['id']}/reject",
        json={"exchange_item_id": rejected_item["id"]},
        headers=as_org("a2222222-2222-4222-a222-222222222222"),
    )
    assert declined.status_code == 200
    assert declined.json()["data"]["items"][0]["status"] == "REJECTED"


# --------------------------------------------------------------------------- matching (Member 3)


async def test_match_seed_requirement(client):
    r = await client.get(f"/api/matches/{SEED_REQ}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["matching_status"] == "MULTI_SUPPLIER_MATCH" and data["unfulfilled_quantity"] == 0
    assert data["total_estimated_cost_bdt"] == 346_200
    assert r.json()["meta"]["requirement"]["id"] == SEED_REQ


async def test_match_statuses(client):
    assert (await client.get(f"/api/matches/{REQ_PLY}")).json()["data"]["matching_status"] == "EXACT_MATCH"
    no_stock = (await client.get(f"/api/matches/{REQ_NO_STOCK}")).json()["data"]
    assert no_stock["matching_status"] == "NO_MATCH" and no_stock["budget"]["status"] == "NOT_APPLICABLE"
    over = (await client.get(f"/api/matches/{REQ_OVER_BUDGET}")).json()["data"]
    assert over["budget"]["status"] == "OVER_BUDGET"
    assert (await client.get("/api/matches/00000000-0000-4000-8000-000000000000")).status_code == 404


async def test_match_not_open_is_409(client):
    await client.patch(f"/api/requirements/{SEED_REQ}", json={"status": "CANCELLED"}, headers=as_org(BUYER_APEX))
    r = await client.get(f"/api/matches/{SEED_REQ}")
    assert r.status_code == 409 and r.json()["error"]["details"]["requirement_status"] == "CANCELLED"


async def test_match_overview_and_evaluation(client):
    r = (await client.get("/api/matches")).json()
    assert r["meta"]["total"] == len(r["data"]) > 0
    assert {row["requirement"]["status"] for row in r["data"]} == {"OPEN"}
    ev = (await client.get("/api/matches/evaluation")).json()["data"]
    assert ev["monoloop"]["precision"] == 1


async def test_reserved_stock_change_is_seen_live(client, store):
    first = (await client.get(f"/api/matches/{SEED_REQ}")).json()["data"]
    for a in first["allocations"]:
        l = store.listings[a["listing_id"]]
        l.reserved_quantity = l.total_quantity  # someone else reserved everything
    after = (await client.get(f"/api/matches/{SEED_REQ}")).json()["data"]
    assert after["allocated_quantity"] < first["allocated_quantity"]


# --------------------------------------------------------------------------- exchanges (Member 4)


async def _request(client, req=SEED_REQ, buyer=BUYER_APEX):
    return await client.post("/api/exchanges", json={"requirement_id": req, "buyer_organization_id": buyer},
                             headers=as_org(buyer))


async def test_full_exchange_flow_updates_inventory(client, store):
    r = await _request(client)
    assert r.status_code == 201
    ex = r.json()["data"]
    assert ex["stage"] == "AWAITING_SUPPLIERS" and len({i["supplier_organization_id"] for i in ex["items"]}) == 2
    before = {i["listing_id"]: store.listings[i["listing_id"]].total_quantity for i in ex["items"]}

    assert (await _request(client)).json()["error"]["code"] == "DUPLICATE_EXCHANGE"
    item = ex["items"][0]
    r = await client.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": item["id"]}, headers=as_org(BUYER_APEX))
    assert r.status_code == 403  # only the supplier may accept

    for item in ex["items"]:
        r = await client.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": item["id"]},
                              headers=as_org(item["supplier_organization_id"]))
        assert r.status_code == 200
    assert r.json()["data"]["stage"] == "RESERVED"
    assert all(store.listings[i["listing_id"]].reserved_quantity >= i["quantity"] for i in ex["items"])

    r = await client.post(f"/api/exchanges/{ex['id']}/complete", headers=as_org(BUYER_APEX))
    assert r.status_code == 200 and r.json()["data"]["status"] == "COMPLETED"
    for i in ex["items"]:
        assert store.listings[i["listing_id"]].total_quantity == before[i["listing_id"]] - i["quantity"]
    assert store.requirements[SEED_REQ].status == "FULFILLED"

    impact = (await client.get("/api/impact")).json()["data"]
    assert impact["recovered"]["completed_exchanges"] == 1 and impact["recovered"]["transferred_units"] == 80
    assert impact["recovered"]["multi_supplier_exchanges"] == 1


async def test_reject_then_cancel_releases_stock(client, store):
    ex = (await _request(client)).json()["data"]
    first, second = ex["items"]
    await client.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": first["id"]},
                      headers=as_org(first["supplier_organization_id"]))
    r = await client.post(f"/api/exchanges/{ex['id']}/reject", json={"exchange_item_id": second["id"]},
                          headers=as_org(second["supplier_organization_id"]))
    assert r.json()["data"]["stage"] == "SUPPLIER_DECLINED"
    reserved = store.listings[first["listing_id"]].reserved_quantity
    r = await client.post(f"/api/exchanges/{ex['id']}/cancel", headers=as_org(BUYER_APEX))
    assert r.json()["data"]["status"] == "CANCELLED"
    assert store.listings[first["listing_id"]].reserved_quantity == reserved - first["quantity"]


async def test_exchange_errors(client):
    assert (await _request(client, REQ_OVER_BUDGET, BUYER_DELTA)).json()["error"]["code"] == "NO_ALLOCATION"
    r = await client.post("/api/exchanges", json={"requirement_id": SEED_REQ, "buyer_organization_id": BUYER_APEX},
                          headers=as_org(BUYER_DELTA))
    assert r.status_code == 403
    ex = (await _request(client)).json()["data"]
    r = await client.post(f"/api/exchanges/{ex['id']}/accept", json={}, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 400
    r = await client.post(f"/api/exchanges/{ex['id']}/complete", headers=as_org(BUYER_APEX))
    assert r.json()["error"]["code"] == "INVALID_STATE"
    assert (await client.get("/api/exchanges", params={"status": "NOPE"})).status_code == 400


async def test_t9_concurrent_acceptance_never_over_allocates(client, store):
    """Two buyers race for the same stock; the second acceptance must fail, not over-allocate."""
    ex1 = (await _request(client)).json()["data"]
    # A second open requirement for the same material, from another buyer.
    other = {**NEW_REQ, "organization_id": BUYER_DELTA, "required_quantity": 80, "thickness_mm": 2}
    req2 = (await client.post("/api/requirements", json=other, headers=as_org(BUYER_DELTA))).json()["data"]["id"]
    ex2 = (await _request(client, req2, BUYER_DELTA)).json()["data"]

    shared = {i["listing_id"] for i in ex1["items"]} & {i["listing_id"] for i in ex2["items"]}
    assert shared, "both exchanges should want the same listing"
    lid = sorted(shared)[0]
    i1 = next(i for i in ex1["items"] if i["listing_id"] == lid)
    i2 = next(i for i in ex2["items"] if i["listing_id"] == lid)

    results = await asyncio.gather(*[
        client.post(f"/api/exchanges/{e['id']}/accept", json={"exchange_item_id": i["id"]},
                    headers=as_org(i["supplier_organization_id"]))
        for e, i in ((ex1, i1), (ex2, i2))
    ])
    listing = store.listings[lid]
    assert listing.reserved_quantity <= listing.total_quantity
    codes = sorted(r.status_code for r in results)
    if i1["quantity"] + i2["quantity"] > listing.total_quantity:
        assert codes == [200, 409]
        assert any((r.json().get("error") or {}).get("code") == "INSUFFICIENT_STOCK" for r in results)


# --------------------------------------------------------------------------- AI extraction


async def test_ai_extraction_mock_and_unconfigured(client):
    prompt = "40 pieces of unused stainless SS304, 2400 x 1200 mm, 1.5mm thick, 4500 taka per sheet, Gazipur"
    r = (await client.post("/api/ai/extract-material", json={"prompt": prompt, "mock": True})).json()
    d = r["data"]
    assert d["material_specification"] == "SS304" and d["length_mm"] == 2400 and d["thickness_mm"] == 1.5
    assert d["total_quantity"] == 40 and d["city"] == "Gazipur" and d["unit_price_bdt"] == 4500
    buyer_prompt = (
        "I need around 100 pieces of SS304 stainless steel sheets. Length should be between 1500 and 2000 mm, "
        "width between 800 and 1000 mm, and thickness can be 2 to 3 mm. The material should be in good condition."
    )
    buyer = (await client.post("/api/ai/extract-requirement", json={"prompt": buyer_prompt, "mock": True})).json()["data"]
    assert buyer["material_specification"] == "SS304"
    assert buyer["length_min_mm"] == 1500 and buyer["length_max_mm"] == 2000
    assert buyer["width_min_mm"] == 800 and buyer["width_max_mm"] == 1000
    assert buyer["thickness_min_mm"] == 2 and buyer["thickness_max_mm"] == 3
    assert buyer["required_quantity"] == 100
    assert buyer["condition_requirement"] == "UNUSED"
    r = (await client.post("/api/ai/extract-material", json={"prompt": prompt})).json()
    assert r["success"] is False and r["error"]["code"] == "AI_UNAVAILABLE"

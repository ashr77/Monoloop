"""Supabase REST repository: unit tests against a fake PostgREST (no network)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import AppError
from app.repositories.base import ExchangeFilter, ListingFilter
from app.repositories.supabase.repositories import (
    SupabaseExchangeRepository,
    SupabaseListingRepository,
    safe_search_term,
    translate_rest_error,
)
from tests.conftest import BUYER_APEX, SUP_GAZIPUR, make_settings

EX = "e0000000-0000-4000-8000-000000000001"
ITEM = "f0000000-0000-4000-8000-000000000001"
LISTING = "c1111111-1111-4111-c111-111111111111"


def fake_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://x.supabase.co/rest/v1")


# --- configuration ---------------------------------------------------------------------

def test_auto_backend_selection():
    rest = dict(supabase_url="https://x.supabase.co", supabase_service_role_key="k")
    assert make_settings(data_backend="auto").use_supabase_rest is False
    assert make_settings(data_backend="auto", **rest).use_supabase_rest is True
    # A database URL always wins over REST in auto mode.
    both = make_settings(data_backend="auto", database_url="postgresql://u:p@h:5432/db", **rest)
    assert both.use_postgres is True and both.use_supabase_rest is False
    explicit = make_settings(data_backend="supabase", **rest)
    assert explicit.use_supabase_rest is True and explicit.use_postgres is False
    assert make_settings(data_backend="memory", **rest).use_supabase_rest is False


def test_supabase_backend_requires_credentials():
    from app.api.deps import build_container

    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        build_container(make_settings(data_backend="supabase"))


# --- error translation and input safety ---------------------------------------------------

def _resp(status: int, body: dict) -> httpx.Response:
    return httpx.Response(status, json=body)


def test_translate_rest_error():
    e = translate_rest_error(_resp(400, {"code": "P0001", "message": "MONOLOOP:INSUFFICIENT_STOCK:Only 3 left"}))
    assert (e.code, e.status, str(e)) == ("INSUFFICIENT_STOCK", 409, "Only 3 left")
    assert translate_rest_error(_resp(409, {"code": "23505", "message": "dup"})).code == "DUPLICATE_EXCHANGE"
    assert translate_rest_error(_resp(400, {"code": "23514", "message": "chk"})).code == "INSUFFICIENT_STOCK"
    assert translate_rest_error(_resp(401, {"message": "bad jwt"})).code == "SERVICE_UNAVAILABLE"
    assert translate_rest_error(httpx.Response(500, text="boom")).code == "INTERNAL_ERROR"


def test_safe_search_term_cannot_inject_filters():
    assert safe_search_term("SS304") == "SS304"
    assert safe_search_term("a),status.eq.ARCHIVED,(b") == "a status.eq.ARCHIVED b"
    for ch in ',()*"%\\':
        assert ch not in safe_search_term(f"x{ch}y")


# --- request shapes -----------------------------------------------------------------------

async def test_listing_list_sends_encoded_filters():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[])

    async with fake_client(handler) as client:
        repo = SupabaseListingRepository(client)
        await repo.list(ListingFilter(organization_id=SUP_GAZIPUR, status="ACTIVE", search="steel),x"))
        assert await repo.list(ListingFilter(organization_id="not-a-uuid")) == []
    assert len(seen) == 1  # invalid uuid never reaches the database
    q = seen[0].url.params
    assert q["organization_id"] == f"eq.{SUP_GAZIPUR}"
    assert q["status"] == "eq.ACTIVE"
    assert "listings_organization_id_fkey" in q["select"]
    assert q["or"] == ('(description.ilike."*steel x*",material_specification.ilike."*steel x*",'
                       'city.ilike."*steel x*")')


async def test_listing_update_guards_reserved_quantity():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "PATCH":
            assert request.url.params["reserved_quantity"] == "lte.5"
            return httpx.Response(200, json=[])  # guard matched nothing
        return httpx.Response(200, json=[{
            "id": LISTING, "organization_id": SUP_GAZIPUR, "material_family": "STAINLESS_STEEL_SHEET",
            "material_specification": "SS304", "length_mm": 1, "width_mm": 1, "thickness_mm": 1,
            "total_quantity": 50, "reserved_quantity": 20, "condition": "UNUSED",
            "unit_price_bdt": 1, "city": "Gazipur",
        }])

    async with fake_client(handler) as client:
        with pytest.raises(AppError) as exc:
            await SupabaseListingRepository(client).update(LISTING, {"total_quantity": 5})
    assert exc.value.code == "INVALID_QUANTITY"


async def test_accept_checks_item_then_calls_atomic_rpc():
    calls: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, body))
        if request.url.path.endswith("/exchange_items"):
            return httpx.Response(200, json=[{"id": ITEM}])
        return httpx.Response(200, json=EX)

    async with fake_client(handler) as client:
        await SupabaseExchangeRepository(client).act("accept", EX, SUP_GAZIPUR, ITEM)
    assert calls[-1] == ("POST", "/rest/v1/rpc/accept_exchange_item", {"p_item_id": ITEM, "p_actor_id": SUP_GAZIPUR})


async def test_accept_unknown_item_is_not_found_without_rpc():
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json=[])

    async with fake_client(handler) as client:
        with pytest.raises(AppError) as exc:
            await SupabaseExchangeRepository(client).act("accept", EX, SUP_GAZIPUR, ITEM)
    assert exc.value.code == "NOT_FOUND"
    assert not any("/rpc/" in p for p in paths)


async def test_rpc_business_error_surfaces_as_app_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"code": "P0001", "message": "MONOLOOP:INVALID_STATE:Exchange is COMPLETED"})

    async with fake_client(handler) as client:
        with pytest.raises(AppError) as exc:
            await SupabaseExchangeRepository(client).act("complete", EX, BUYER_APEX, None)
    assert (exc.value.code, exc.value.status) == ("INVALID_STATE", 409)


async def test_network_failure_is_service_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    async with fake_client(handler) as client:
        with pytest.raises(AppError) as exc:
            await SupabaseExchangeRepository(client).list(ExchangeFilter())
    assert exc.value.code == "SERVICE_UNAVAILABLE"


async def test_exchange_list_for_org_includes_supplied_exchanges():
    seen: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rsplit("/", 1)[-1]
        if path == "exchange_items" and "supplier_organization_id" in request.url.params:
            return httpx.Response(200, json=[{"exchange_id": EX}])
        seen.setdefault(path, request)
        return httpx.Response(200, json=[])

    async with fake_client(handler) as client:
        assert await SupabaseExchangeRepository(client).list(ExchangeFilter(organization_id=SUP_GAZIPUR)) == []
    assert seen["exchanges"].url.params["or"] == f"(buyer_organization_id.eq.{SUP_GAZIPUR},id.in.({EX}))"


# --- pasted configuration is cleaned -------------------------------------------------------

@pytest.mark.parametrize("url", [
    "https://x.supabase.co", " https://x.supabase.co ", "https://x.supabase.co/", '"https://x.supabase.co"',
    "https://x.supabase.co/rest/v1", "https://x.supabase.co\n",
])
def test_supabase_url_paste_variants_are_normalised(url):
    assert make_settings(supabase_url=url).supabase_url == "https://x.supabase.co"


def test_supabase_url_without_scheme_fails_fast():
    with pytest.raises(ValueError, match="https://"):
        make_settings(supabase_url="x.supabase.co")


@pytest.mark.parametrize("key", ["abc.def.ghi", " abc.def.ghi\n", '"abc.def.ghi"', "abc.def\n.ghi", "'abc.def.ghi' "])
def test_keys_lose_whitespace_and_quotes(key):
    s = make_settings(supabase_service_role_key=key, sslcommerz_store_password=key, ai_api_key=key)
    assert s.supabase_service_role_key == s.sslcommerz_store_password == s.ai_api_key == "abc.def.ghi"


async def test_health_reports_failure_type_not_details():
    from app.api.deps import build_container
    from app.main import create_app

    settings = make_settings(data_backend="supabase", supabase_url="https://x.supabase.co",
                             supabase_service_role_key="k")
    app = create_app(settings)
    app.state.container = build_container(settings)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom secret-ish detail", request=request)

    app.state.container.rest = httpx.AsyncClient(transport=httpx.MockTransport(down), base_url="https://x/rest/v1")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        data = (await c.get("/api/health")).json()["data"]
    assert data["database"] == "unreachable (ConnectError)"
    await app.state.container.aclose()

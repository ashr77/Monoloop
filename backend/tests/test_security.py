"""Security behaviour: CORS, headers, rate limiting, body limits, identity, error hygiene."""

from __future__ import annotations

import httpx
import pytest

from app.api.deps import build_container
from app.main import create_app
from tests.conftest import BUYER_APEX, SEED_REQ, make_settings


async def _client(**overrides):
    settings = make_settings(**overrides)
    app = create_app(settings)
    app.state.container = build_container(settings)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test"), app


async def test_security_headers_and_request_id(client):
    r = await client.get("/api/organizations", headers={"X-Request-ID": "trace-12345678"})
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-request-id"] == "trace-12345678"
    assert r.headers["server-timing"].startswith("app;dur=")


async def test_cors_allows_only_configured_origin(client):
    ok = await client.options("/api/listings", headers={"Origin": "http://localhost:3000",
                                                        "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = await client.options("/api/listings", headers={"Origin": "https://evil.example",
                                                         "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


async def test_rate_limit_returns_429_with_retry_after():
    c, _ = await _client(rate_limit_per_minute=3)
    async with c:
        codes = [(await c.get("/api/organizations")).status_code for _ in range(4)]
        assert codes == [200, 200, 200, 429]
        r = await c.get("/api/organizations")
        assert r.json()["error"]["code"] == "RATE_LIMITED" and int(r.headers["retry-after"]) >= 1


async def test_body_size_limit():
    c, _ = await _client(max_body_bytes=1024)
    async with c:
        r = await c.post("/api/ai/extract-material", content=b'{"prompt":"' + b"x" * 5000 + b'"}',
                         headers={"content-type": "application/json"})
        assert r.status_code == 413 and r.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


@pytest.mark.parametrize("header", ["not-a-uuid", "' OR 1=1 --"])
async def test_actor_header_must_be_uuid(client, header):
    r = await client.patch(f"/api/requirements/{SEED_REQ}", json={"status": "CANCELLED"},
                           headers={"X-Organization-Id": header})
    assert r.status_code == 400


async def test_search_is_parameterised_not_injected(client):
    r = await client.get("/api/listings", params={"search": "%' OR '1'='1"})
    assert r.status_code == 200 and r.json()["data"] == []


async def test_errors_never_leak_internals(app, monkeypatch):
    async def boom(*_a, **_k):
        raise RuntimeError("password=hunter2 at db.internal:5432")

    monkeypatch.setattr(app.state.container.organizations, "list", boom)
    # Starlette re-raises after sending the 500 (so servers can log it); don't let the test client re-raise.
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/organizations")
    assert r.status_code == 500
    assert r.json() == {"success": False, "error": {"code": "INTERNAL_ERROR", "message": "Unexpected server error."}}


async def test_jwt_mode_requires_bearer_token():
    c, _ = await _client(auth_mode="jwt", supabase_jwks_url="https://example.invalid/jwks.json")
    async with c:
        r = await c.patch(f"/api/requirements/{SEED_REQ}", json={"status": "CANCELLED"},
                          headers={"X-Organization-Id": BUYER_APEX})
        assert r.status_code == 401
        r = await c.patch(f"/api/requirements/{SEED_REQ}", json={"status": "CANCELLED"},
                          headers={"Authorization": "Bearer not.a.jwt"})
        assert r.status_code == 401


async def test_docs_disabled_in_production():
    c, _ = await _client(environment="production")
    async with c:
        assert (await c.get("/docs")).status_code == 404
        assert "strict-transport-security" in (await c.get("/api/health")).headers

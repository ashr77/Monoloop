"""Company accounts & admin approval (AUTH_MODE=jwt, in-process login provider)."""

from __future__ import annotations

import httpx
import pytest

from app.api.deps import build_container
from app.main import create_app
from tests.conftest import SUP_GAZIPUR, make_settings

COMPANY = {"company_name": "Chattogram Steel Works", "city": "Chattogram", "address": "Plot 7, BSCIC",
           "license_number": "TRAD/CTG/2026/0042", "email": "Owner@CtgSteel.example", "password": "s3cure-pass"}


def listing_for(org_id: str) -> dict:
    return {"organization_id": org_id, "material_family": "STAINLESS_STEEL_SHEET", "material_specification": "SS304",
            "length_mm": 2400, "width_mm": 1200, "thickness_mm": 1.5, "total_quantity": 40, "condition": "UNUSED",
            "unit_price_bdt": 4100, "city": "Chattogram"}


@pytest.fixture
async def jwt_client():
    settings = make_settings(auth_mode="jwt")
    app = create_app(settings)
    app.state.container = build_container(settings)
    await app.state.container.auth.create_admin("admin@example.com", "admin-pass-1")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await app.state.container.aclose()


def bearer(session: dict) -> dict:
    return {"Authorization": f"Bearer {session['access_token']}"}


async def signup(c, **overrides) -> dict:
    r = await c.post("/api/auth/signup", json={**COMPANY, **overrides})
    assert r.status_code == 201, r.text
    return r.json()["data"]


async def admin_session(c) -> dict:
    return (await c.post("/api/auth/login", json={"email": "admin@example.com", "password": "admin-pass-1"})).json()["data"]


async def test_health_reports_auth_mode(jwt_client):
    assert (await jwt_client.get("/api/health")).json()["data"]["auth_mode"] == "jwt"


async def test_signup_creates_pending_company_and_session(jwt_client):
    s = await signup(jwt_client)
    org = s["profile"]["organization"]
    assert s["profile"] == {**s["profile"], "email": "owner@ctgsteel.example", "role": "company"}
    assert (org["status"], org["organization_type"], org["license_number"]) == ("PENDING", "HYBRID", "TRAD/CTG/2026/0042")
    me = (await jwt_client.get("/api/auth/me", headers=bearer(s))).json()["data"]
    assert me["organization"]["id"] == org["id"]

    # Pending applicants are not in the public directory, and licence/email never are.
    public = (await jwt_client.get("/api/organizations")).json()["data"]
    assert org["id"] not in {o["id"] for o in public}
    assert all("license_number" not in o and "contact_email" not in o for o in public)


async def test_pending_company_cannot_write(jwt_client):
    s = await signup(jwt_client)
    r = await jwt_client.post("/api/listings", json=listing_for(s["profile"]["organization"]["id"]), headers=bearer(s))
    assert r.status_code == 403 and r.json()["error"]["code"] == "ACCOUNT_PENDING"


async def test_duplicate_email_and_license_are_rejected(jwt_client):
    await signup(jwt_client)
    r = await jwt_client.post("/api/auth/signup", json={**COMPANY, "license_number": "OTHER-1"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "EMAIL_TAKEN"
    r = await jwt_client.post("/api/auth/signup", json={**COMPANY, "email": "x@y.example",
                                                         "license_number": "trad/ctg/2026/0042"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "LICENSE_TAKEN"


@pytest.mark.parametrize("bad", [{"password": "short"}, {"email": "not-an-email"}, {"license_number": "!!"},
                                 {"company_name": ""}, {"role": "admin"}])
async def test_signup_validation(jwt_client, bad):
    r = await jwt_client.post("/api/auth/signup", json={**COMPANY, **bad})
    assert r.status_code == 400


async def test_login_errors_and_bad_tokens(jwt_client):
    await signup(jwt_client)
    r = await jwt_client.post("/api/auth/login", json={"email": COMPANY["email"], "password": "wrong-pass"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert (await jwt_client.get("/api/auth/me")).status_code == 401
    assert (await jwt_client.get("/api/auth/me", headers={"Authorization": "Bearer forged.token.value"})).status_code == 401


async def test_admin_approves_then_company_trades_only_as_itself(jwt_client):
    s = await signup(jwt_client)
    org_id = s["profile"]["organization"]["id"]
    admin = await admin_session(jwt_client)

    # Only admins see and review applications.
    assert (await jwt_client.get("/api/admin/organizations", headers=bearer(s))).json()["error"]["code"] == "ADMIN_ONLY"
    pending = (await jwt_client.get("/api/admin/organizations?status=PENDING", headers=bearer(admin))).json()["data"]
    assert [o["id"] for o in pending] == [org_id] and pending[0]["license_number"] == "TRAD/CTG/2026/0042"

    r = await jwt_client.post(f"/api/admin/organizations/{org_id}/approve", headers=bearer(admin))
    assert r.json()["data"]["status"] == "APPROVED"

    # Same token keeps working: approval is checked live, no re-login needed.
    r = await jwt_client.post("/api/listings", json=listing_for(org_id), headers=bearer(s))
    assert r.status_code == 201, r.text
    # Cannot act for another company, via header or body.
    r = await jwt_client.post("/api/listings", json=listing_for(SUP_GAZIPUR), headers=bearer(s))
    assert r.status_code == 403
    r = await jwt_client.post("/api/listings", json=listing_for(org_id),
                              headers={**bearer(s), "X-Organization-Id": SUP_GAZIPUR})
    assert r.status_code == 403
    # Approved company appears in the public directory.
    assert org_id in {o["id"] for o in (await jwt_client.get("/api/organizations")).json()["data"]}


async def test_admin_cannot_trade(jwt_client):
    admin = await admin_session(jwt_client)
    r = await jwt_client.post("/api/listings", json=listing_for(SUP_GAZIPUR), headers=bearer(admin))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN_ROLE"


async def test_reject_with_reason_then_resubmit(jwt_client):
    s = await signup(jwt_client)
    org_id = s["profile"]["organization"]["id"]
    admin = await admin_session(jwt_client)
    r = await jwt_client.post(f"/api/admin/organizations/{org_id}/reject", json={"reason": "Licence number not found"},
                              headers=bearer(admin))
    assert r.json()["data"]["status"] == "REJECTED"
    me = (await jwt_client.get("/api/auth/me", headers=bearer(s))).json()["data"]["organization"]
    assert (me["status"], me["rejection_reason"]) == ("REJECTED", "Licence number not found")

    r = await jwt_client.patch("/api/auth/application", json={"license_number": "TRAD/CTG/2026/0043"}, headers=bearer(s))
    org = r.json()["data"]["organization"]
    assert (org["status"], org["license_number"], org["rejection_reason"]) == ("PENDING", "TRAD/CTG/2026/0043", None)
    # Resubmitting while pending is not allowed.
    assert (await jwt_client.patch("/api/auth/application", json={}, headers=bearer(s))).status_code == 409


async def test_suspended_company_is_blocked(jwt_client):
    s = await signup(jwt_client)
    org_id = s["profile"]["organization"]["id"]
    admin = await admin_session(jwt_client)
    await jwt_client.post(f"/api/admin/organizations/{org_id}/approve", headers=bearer(admin))
    await jwt_client.post(f"/api/admin/organizations/{org_id}/suspend", json={"reason": "Fraud report"},
                          headers=bearer(admin))
    r = await jwt_client.post("/api/listings", json=listing_for(org_id), headers=bearer(s))
    assert r.status_code == 403 and r.json()["error"]["code"] == "ACCOUNT_PENDING"


async def test_refresh_rotates_tokens(jwt_client):
    s = await signup(jwt_client)
    r = await jwt_client.post("/api/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 200 and r.json()["data"]["profile"]["role"] == "company"
    again = await jwt_client.post("/api/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert again.status_code == 401


async def test_company_sees_only_its_own_exchanges(jwt_client):
    s = await signup(jwt_client)
    org_id = s["profile"]["organization"]["id"]
    admin = await admin_session(jwt_client)
    await jwt_client.post(f"/api/admin/organizations/{org_id}/approve", headers=bearer(admin))
    r = await jwt_client.get(f"/api/exchanges?organization_id={SUP_GAZIPUR}", headers=bearer(s))
    assert r.status_code == 200 and r.json()["data"] == []


async def test_demo_accounts_for_existing_companies(jwt_client):
    auth = jwt_client._transport.app.state.container.auth  # type: ignore[attr-defined]
    created = await auth.ensure_demo_accounts("demo-pass-1")
    emails = {e for _, e in created}
    assert "gazipur@monoloop.demo" in emails and "apex@monoloop.demo" in emails
    assert await auth.ensure_demo_accounts("demo-pass-1") == []  # idempotent

    s = (await jwt_client.post("/api/auth/login", json={"email": "gazipur@monoloop.demo",
                                                         "password": "demo-pass-1"})).json()["data"]
    assert s["profile"]["organization"]["id"] == SUP_GAZIPUR
    assert s["profile"]["organization"]["status"] == "APPROVED"
    r = await jwt_client.post("/api/listings", json={**listing_for(SUP_GAZIPUR), "city": "Gazipur"}, headers=bearer(s))
    assert r.status_code == 201, r.text


async def test_every_company_with_a_login_can_buy_and_sell(jwt_client):
    """Gazipur was seeded as SUPPLIER and Apex as BUYER; with logins both do both."""
    from tests.conftest import BUYER_APEX
    auth = jwt_client._transport.app.state.container.auth  # type: ignore[attr-defined]
    await auth.ensure_demo_accounts("demo-pass-1")
    login = lambda e: jwt_client.post("/api/auth/login", json={"email": e, "password": "demo-pass-1"})  # noqa: E731
    gazipur = (await login("gazipur@monoloop.demo")).json()["data"]
    apex = (await login("apex@monoloop.demo")).json()["data"]
    assert gazipur["profile"]["organization"]["organization_type"] == "HYBRID"

    # Former buyer lists surplus...
    r = await jwt_client.post("/api/listings", json={**listing_for(BUYER_APEX), "city": "Dhaka"}, headers=bearer(apex))
    assert r.status_code == 201, r.text
    listing_id = r.json()["data"]["id"]
    # ...and the former supplier chats with it as a buyer.
    r = await jwt_client.post("/api/conversations", json={"listing_id": listing_id}, headers=bearer(gazipur))
    assert r.status_code == 201, r.text

"""Exchange payments (Member 4): service rules, callbacks and the SSLCommerz client.

The service tests use a fake gateway (no network); the SSLCommerz client is tested against
httpx.MockTransport so the exact requests sent to the gateway are checked.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.api.deps import build_container
from app.main import create_app
from app.services.payments.gateway import GatewayError, Session, SessionRequest, SSLCommerzGateway, Validation
from tests.conftest import BUYER_APEX, SEED_REQ, SUP_DHAKA, as_org, make_settings

PAY_SETTINGS = dict(payment_provider="sslcommerz", sslcommerz_store_id="teststore",
                    sslcommerz_store_password="secret", frontend_url="http://front.test")


class FakeGateway:
    name = "SSLCOMMERZ"
    sandbox = True

    def __init__(self):
        self.sessions: list[SessionRequest] = []
        self.validations: dict[str, Validation] = {}
        self.fail_session = False
        self.fail_validation = False

    async def create_session(self, req: SessionRequest) -> Session:
        if self.fail_session:
            raise GatewayError("refused")
        self.sessions.append(req)
        return Session(gateway_url=f"https://sandbox.test/pay/{req.tran_id}", session_key="SESSION")

    async def validate(self, val_id: str) -> Validation:
        if self.fail_validation:
            raise GatewayError("down")
        return self.validations[val_id]

    def approve(self, val_id: str, tran_id: str, amount: float, status: str = "VALID", currency: str = "BDT"):
        self.validations[val_id] = Validation(status, tran_id, amount, currency, val_id, "BANK1", "VISA-Brac bank")


@pytest.fixture
async def pay_app():
    settings = make_settings(**PAY_SETTINGS)
    app = create_app(settings)
    container = build_container(settings)
    gateway = FakeGateway()
    container.payments.gateway = gateway
    app.state.container = container
    yield app, gateway
    await container.aclose()


@pytest.fixture
async def pc(pay_app):
    app, gateway = pay_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c, gateway


async def reserved_exchange(c: httpx.AsyncClient) -> dict:
    r = await c.post("/api/exchanges", json={"requirement_id": SEED_REQ, "buyer_organization_id": BUYER_APEX},
                     headers=as_org(BUYER_APEX))
    ex = r.json()["data"]
    for item in ex["items"]:
        r = await c.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": item["id"]},
                         headers=as_org(item["supplier_organization_id"]))
    data = r.json()["data"]
    assert data["stage"] == "RESERVED"
    return data


async def start(c, ex_id: str, org: str = BUYER_APEX):
    return await c.post(f"/api/payments/exchanges/{ex_id}", headers=as_org(org))


async def callback(c, kind: str, **fields):
    return await c.post(f"/api/payments/sslcommerz/{kind}", content="&".join(f"{k}={v}" for k, v in fields.items()),
                        headers={"Content-Type": "application/x-www-form-urlencoded"})


def redirect_params(resp: httpx.Response) -> dict[str, str]:
    assert resp.status_code == 303
    url = urlparse(resp.headers["location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "http://front.test/exchanges"
    return {k: v[0] for k, v in parse_qs(url.query).items()}


# --- switched off ------------------------------------------------------------------------

async def test_payment_off_by_default(client):
    health = (await client.get("/api/health")).json()["data"]
    assert health["payment_configured"] is False
    r = await client.post("/api/payments/exchanges/00000000-0000-4000-8000-000000000000", headers=as_org(BUYER_APEX))
    assert r.status_code == 503 and r.json()["error"]["code"] == "PAYMENT_NOT_CONFIGURED"


# --- start -------------------------------------------------------------------------------

async def test_start_requires_buyer_and_reserved_stage(pc):
    c, gateway = pc
    r = await c.post("/api/exchanges", json={"requirement_id": SEED_REQ, "buyer_organization_id": BUYER_APEX},
                     headers=as_org(BUYER_APEX))
    ex = r.json()["data"]
    assert ex["payment_required"] is True and ex["payment"] is None
    assert (await start(c, ex["id"])).json()["error"]["code"] == "INVALID_STATE"  # suppliers not yet accepted

    ex = await reserved_exchange_after(c, ex)
    assert (await start(c, ex["id"], SUP_DHAKA)).status_code == 403
    assert (await start(c, ex["id"], org="")).status_code == 400
    assert not gateway.sessions


async def reserved_exchange_after(c, ex: dict) -> dict:
    for item in ex["items"]:
        r = await c.post(f"/api/exchanges/{ex['id']}/accept", json={"exchange_item_id": item["id"]},
                         headers=as_org(item["supplier_organization_id"]))
    return r.json()["data"]


async def test_start_creates_initiated_payment_and_session(pc):
    c, gateway = pc
    ex = await reserved_exchange(c)
    r = await start(c, ex["id"])
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["amount_bdt"] == ex["total_value_bdt"] == 50 * 4200 + 30 * 4350
    assert data["gateway_url"].startswith("https://sandbox.test/pay/") and data["sandbox"] is True
    req = gateway.sessions[0]
    assert req.tran_id == data["tran_id"] and req.reference == ex["id"]
    assert req.success_url == "http://localhost:8000/api/payments/sslcommerz/success"

    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == "INITIATED"


async def test_gateway_refusal_is_502_and_payment_marked_failed(pc):
    c, gateway = pc
    ex = await reserved_exchange(c)
    gateway.fail_session = True
    r = await start(c, ex["id"])
    assert r.status_code == 502 and r.json()["error"]["code"] == "PAYMENT_GATEWAY_ERROR"
    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == "FAILED"


# --- completion rules --------------------------------------------------------------------

async def test_complete_requires_payment_then_works(pc):
    c, gateway = pc
    ex = await reserved_exchange(c)
    r = await c.post(f"/api/exchanges/{ex['id']}/complete", headers=as_org(BUYER_APEX))
    assert r.status_code == 409 and r.json()["error"]["code"] == "PAYMENT_REQUIRED"

    tran = (await start(c, ex["id"])).json()["data"]
    gateway.approve("VAL1", tran["tran_id"], tran["amount_bdt"])
    params = redirect_params(await callback(c, "success", tran_id=tran["tran_id"], val_id="VAL1", status="VALID"))
    assert params == {"payment": "success", "as": BUYER_APEX, "highlight": ex["id"]}

    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == "PAID" and view["payment"]["card_type"] == "VISA-Brac bank"
    assert (await start(c, ex["id"])).json()["error"]["code"] == "PAYMENT_ALREADY_COMPLETED"
    cancel = await c.post(f"/api/exchanges/{ex['id']}/cancel", headers=as_org(BUYER_APEX))
    assert cancel.status_code == 409  # paid exchanges are not cancelled (no refunds in the prototype)

    done = await c.post(f"/api/exchanges/{ex['id']}/complete", headers=as_org(BUYER_APEX))
    assert done.status_code == 200 and done.json()["data"]["stage"] == "COMPLETED"


async def test_cancel_still_allowed_before_payment(pc):
    c, _ = pc
    ex = await reserved_exchange(c)
    r = await c.post(f"/api/exchanges/{ex['id']}/cancel", headers=as_org(BUYER_APEX))
    assert r.status_code == 200 and r.json()["data"]["stage"] == "CANCELLED"


# --- callbacks are never trusted -----------------------------------------------------------

@pytest.mark.parametrize("tamper", [
    dict(amount=1.00),               # paid less than the exchange value
    dict(status="INVALID_TRANSACTION"),
    dict(currency="USD"),
    dict(tran_id="SOMEONE-ELSE"),    # val_id belongs to another order
])
async def test_success_rejected_when_validation_disagrees(pc, tamper):
    c, gateway = pc
    ex = await reserved_exchange(c)
    tran = (await start(c, ex["id"])).json()["data"]
    v = dict(tran_id=tran["tran_id"], amount=tran["amount_bdt"], status="VALID", currency="BDT") | tamper
    gateway.approve("VALX", v["tran_id"], v["amount"], status=v["status"], currency=v["currency"])

    params = redirect_params(await callback(c, "success", tran_id=tran["tran_id"], val_id="VALX", status="VALID"))
    assert params["payment"] == "failed"
    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == "FAILED"
    assert (await c.post(f"/api/exchanges/{ex['id']}/complete", headers=as_org(BUYER_APEX))).status_code == 409


async def test_unknown_or_missing_tran_id_is_invalid(pc):
    c, _ = pc
    assert redirect_params(await callback(c, "success", tran_id="NOPE", val_id="X"))["payment"] == "invalid"
    assert redirect_params(await callback(c, "success"))["payment"] == "invalid"


async def test_success_without_val_id_fails_and_unreachable_validation_keeps_initiated(pc):
    c, gateway = pc
    ex = await reserved_exchange(c)
    tran = (await start(c, ex["id"])).json()["data"]
    assert redirect_params(await callback(c, "success", tran_id=tran["tran_id"]))["payment"] == "failed"

    gateway.fail_validation = True
    assert redirect_params(await callback(c, "success", tran_id=tran["tran_id"], val_id="V"))["payment"] == "failed"
    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == "INITIATED"  # a later IPN can still confirm it


async def test_duplicate_success_and_ipn_record_payment_once(pc):
    c, gateway = pc
    ex = await reserved_exchange(c)
    tran = (await start(c, ex["id"])).json()["data"]
    gateway.approve("VAL2", tran["tran_id"], tran["amount_bdt"])
    for _ in range(2):
        assert redirect_params(await callback(c, "success", tran_id=tran["tran_id"], val_id="VAL2"))["payment"] == "success"
    ipn = await callback(c, "ipn", tran_id=tran["tran_id"], val_id="VAL2", status="VALID")
    assert ipn.status_code == 200 and ipn.json()["data"]["outcome"] == "success"
    # A late "fail" for the same transaction must not undo the payment.
    assert redirect_params(await callback(c, "fail", tran_id=tran["tran_id"]))["payment"] == "success"
    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == "PAID"


@pytest.mark.parametrize(("kind", "outcome", "status"), [("fail", "failed", "FAILED"), ("cancel", "cancelled", "CANCELLED")])
async def test_fail_and_cancel_returns(pc, kind, outcome, status):
    c, _ = pc
    ex = await reserved_exchange(c)
    tran = (await start(c, ex["id"])).json()["data"]
    assert redirect_params(await callback(c, kind, tran_id=tran["tran_id"]))["payment"] == outcome
    view = (await c.get(f"/api/exchanges/{ex['id']}")).json()["data"]
    assert view["payment"]["status"] == status
    # The buyer can simply try again.
    assert (await start(c, ex["id"])).status_code == 200


# --- SSLCommerz client ---------------------------------------------------------------------

async def test_sslcommerz_session_and_validation_requests():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/gwprocess/v4/api.php"):
            return httpx.Response(200, json={"status": "SUCCESS", "GatewayPageURL": "https://gw/pay", "sessionkey": "K"})
        return httpx.Response(200, json={"status": "VALID", "tran_id": "T1", "amount": "100.00",
                                         "currency_amount": "100.00", "currency_type": "BDT", "val_id": "V1",
                                         "bank_tran_id": "B1", "card_type": "VISA"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        gw = SSLCommerzGateway(http, "store", "pw", sandbox=True)
        session = await gw.create_session(SessionRequest(
            "T1", 100.0, "80 x SS304", "Apex", "a@b.example", "01700000000", "Dhaka", "Dhaka",
            "http://api/s", "http://api/f", "http://api/c", "http://api/i", "EX1"))
        v = await gw.validate("V1")

    assert session == Session("https://gw/pay", "K")
    sent = parse_qs(seen[0].content.decode())
    assert seen[0].url.host == "sandbox.sslcommerz.com"
    assert sent["store_id"] == ["store"] and sent["total_amount"] == ["100.00"] and sent["currency"] == ["BDT"]
    assert sent["tran_id"] == ["T1"] and sent["value_a"] == ["EX1"] and sent["success_url"] == ["http://api/s"]
    assert seen[1].url.params["val_id"] == "V1" and seen[1].url.params["store_id"] == "store"
    assert v.successful and (v.tran_id, v.amount, v.currency) == ("T1", 100.0, "BDT")


async def test_sslcommerz_refusal_and_live_host():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "FAILED", "failedreason": "Store Credential Error"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        gw = SSLCommerzGateway(http, "store", "pw", sandbox=False)
        assert gw.session_url.startswith("https://securepay.sslcommerz.com")
        with pytest.raises(GatewayError, match="Store Credential Error"):
            await gw.create_session(SessionRequest(*(["x"] * 1), 1.0, *(["x"] * 11)))

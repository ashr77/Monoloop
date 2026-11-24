"""Payment gateways (Strategy pattern).

PaymentService depends only on the PaymentGateway protocol; SSLCommerz is one implementation.
Another provider (bKash, Stripe, ...) is added by writing a new class, without touching callers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx


class GatewayError(Exception):
    """The gateway refused the request or could not be reached."""


@dataclass(frozen=True, slots=True)
class SessionRequest:
    tran_id: str
    amount_bdt: float
    product_name: str
    customer_name: str
    customer_email: str
    customer_phone: str
    customer_address: str
    customer_city: str
    success_url: str
    fail_url: str
    cancel_url: str
    ipn_url: str
    reference: str  # our exchange id, echoed back by the gateway


@dataclass(frozen=True, slots=True)
class Session:
    gateway_url: str
    session_key: str


@dataclass(frozen=True, slots=True)
class Validation:
    """The gateway's own record of a transaction, fetched server-to-server."""

    status: str
    tran_id: str
    amount: float
    currency: str
    val_id: str
    bank_tran_id: str | None
    card_type: str | None

    @property
    def successful(self) -> bool:
        return self.status in ("VALID", "VALIDATED")


class PaymentGateway(Protocol):
    name: str
    sandbox: bool

    async def create_session(self, req: SessionRequest) -> Session: ...
    async def validate(self, val_id: str) -> Validation: ...


class SSLCommerzGateway:
    """SSLCommerz v4: session API + order validation API (developer.sslcommerz.com/doc/v4)."""

    name = "SSLCOMMERZ"

    def __init__(self, http: httpx.AsyncClient, store_id: str, store_password: str, sandbox: bool = True):
        self.http = http
        self.store_id = store_id
        self.store_password = store_password
        self.sandbox = sandbox
        host = "https://sandbox.sslcommerz.com" if sandbox else "https://securepay.sslcommerz.com"
        self.session_url = f"{host}/gwprocess/v4/api.php"
        self.validation_url = f"{host}/validator/api/validationserverAPI.php"

    async def create_session(self, req: SessionRequest) -> Session:
        form = {
            "store_id": self.store_id,
            "store_passwd": self.store_password,
            "total_amount": f"{req.amount_bdt:.2f}",
            "currency": "BDT",
            "tran_id": req.tran_id,
            "success_url": req.success_url,
            "fail_url": req.fail_url,
            "cancel_url": req.cancel_url,
            "ipn_url": req.ipn_url,
            "cus_name": req.customer_name[:50],
            "cus_email": req.customer_email,
            "cus_add1": req.customer_address[:50],
            "cus_city": req.customer_city[:50],
            "cus_postcode": "1000",
            "cus_country": "Bangladesh",
            "cus_phone": req.customer_phone,
            "shipping_method": "NO",
            "product_name": req.product_name[:255],
            "product_category": "Industrial surplus",
            "product_profile": "general",
            "value_a": req.reference,
        }
        try:
            r = await self.http.post(self.session_url, data=form, timeout=20)
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise GatewayError("Payment gateway is unreachable.") from exc
        url = data.get("GatewayPageURL")
        if data.get("status") != "SUCCESS" or not url:
            raise GatewayError(f"Payment gateway refused the session: {data.get('failedreason') or 'unknown reason'}")
        return Session(gateway_url=url, session_key=str(data.get("sessionkey") or ""))

    async def validate(self, val_id: str) -> Validation:
        params = {"val_id": val_id, "store_id": self.store_id, "store_passwd": self.store_password, "format": "json"}
        try:
            r = await self.http.get(self.validation_url, params=params, timeout=20)
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise GatewayError("Payment gateway validation is unreachable.") from exc
        try:
            # currency_amount/currency_type are in the original currency of the order.
            amount = float(data.get("currency_amount") or data.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        return Validation(
            status=str(data.get("status") or "INVALID"),
            tran_id=str(data.get("tran_id") or ""),
            amount=amount,
            currency=str(data.get("currency_type") or data.get("currency") or ""),
            val_id=str(data.get("val_id") or val_id),
            bank_tran_id=data.get("bank_tran_id") or None,
            card_type=data.get("card_type") or None,
        )

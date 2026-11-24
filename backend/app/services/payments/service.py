"""Exchange payments (Member 4).

Flow
  1. Buyer starts payment for a RESERVED exchange -> PAYMENT row INITIATED -> gateway session.
  2. Buyer pays on the gateway page; the gateway sends the browser back to our success/fail/cancel
     URL (and, when the API is public, an IPN server-to-server).
  3. On success/IPN we never trust the posted fields: the backend asks the gateway's validation
     API about val_id and accepts only if status, tran_id, amount and currency all match.
  4. INITIATED -> PAID happens once (conditional update + one-PAID-per-exchange unique index).

Amount = material value of the exchange (price snapshot x quantity), the same figure the
exchange view shows. Transport is estimated only and settled outside the platform.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Literal

from app.core.config import Settings
from app.core.errors import AppError
from app.repositories.base import Repositories
from app.schemas.entities import now_iso
from app.schemas.payment import PaymentRecord, PaymentStart
from app.services.payments.gateway import GatewayError, PaymentGateway, SessionRequest

logger = logging.getLogger("monoloop.payments")

ReturnKind = Literal["success", "fail", "cancel", "ipn"]
Outcome = Literal["success", "failed", "cancelled", "invalid"]


@dataclass(frozen=True, slots=True)
class CallbackResult:
    outcome: Outcome
    exchange_id: str | None = None
    payer_organization_id: str | None = None


def _same_amount(a: float, b: float) -> bool:
    return abs(round(a, 2) - round(b, 2)) < 0.005


class PaymentService:
    def __init__(self, repos: Repositories, settings: Settings, gateway: PaymentGateway | None):
        self.repos = repos
        self.settings = settings
        self.gateway = gateway

    @property
    def enabled(self) -> bool:
        return self.gateway is not None and self.repos.payments is not None

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise AppError("PAYMENT_NOT_CONFIGURED", "Online payment is not configured on this server.")

    async def paid_exchange_ids(self, exchange_ids: list[str]) -> set[str]:
        if not self.enabled or not exchange_ids:
            return set()
        return {p.exchange_id for p in await self.repos.payments.for_exchanges(exchange_ids) if p.status == "PAID"}

    async def latest_by_exchange(self, exchange_ids: list[str]) -> dict[str, PaymentRecord]:
        """PAID payment if there is one, otherwise the most recent attempt."""
        if not self.enabled or not exchange_ids:
            return {}
        out: dict[str, PaymentRecord] = {}
        for p in await self.repos.payments.for_exchanges(exchange_ids):
            current = out.get(p.exchange_id)
            if current is None or current.status != "PAID" and (p.status == "PAID" or p.created_at >= current.created_at):
                out[p.exchange_id] = p
        return out

    async def start(self, exchange_id: str, actor_id: str) -> PaymentStart:
        self._require_enabled()
        view = await self.repos.exchanges.get(exchange_id)
        if view is None:
            raise AppError("NOT_FOUND", f"Exchange {exchange_id} was not found.")
        if view.buyer_organization_id != actor_id:
            raise AppError("FORBIDDEN_ORGANIZATION", "Only the buyer can pay for this exchange.")
        if view.stage != "RESERVED":
            raise AppError("INVALID_STATE", "Payment opens once every supplier has accepted and the stock is reserved.")
        if exchange_id in await self.paid_exchange_ids([exchange_id]):
            raise AppError("PAYMENT_ALREADY_COMPLETED", "This exchange has already been paid.")

        amount = round(float(view.total_value_bdt), 2)
        if amount <= 0:
            raise AppError("INVALID_STATE", "Nothing to pay for this exchange.")

        tran_id = "MLP" + uuid.uuid4().hex[:20].upper()
        payment = await self.repos.payments.create({
            "exchange_id": exchange_id, "payer_organization_id": actor_id, "provider": self.gateway.name,
            "tran_id": tran_id, "amount_bdt": amount, "currency": "BDT", "status": "INITIATED",
        })

        buyer = view.buyer
        req = view.requirement
        api = self.settings.public_api_url.rstrip("/")
        product = (f"{view.total_quantity} x {req.material_specification} ({req.material_family})"
                   if req else f"{view.total_quantity} pieces of industrial surplus")
        try:
            session = await self.gateway.create_session(SessionRequest(
                tran_id=tran_id,
                amount_bdt=amount,
                product_name=product,
                customer_name=buyer.name if buyer else "Meguri buyer",
                # Demo organizations have no contact details; a real deployment takes these from the account.
                customer_email=f"buyer-{actor_id[:8]}@monoloop.example",
                customer_phone="01700000000",
                customer_address=(buyer.address or buyer.city) if buyer else "Dhaka",
                customer_city=buyer.city if buyer else "Dhaka",
                success_url=f"{api}/api/payments/sslcommerz/success",
                fail_url=f"{api}/api/payments/sslcommerz/fail",
                cancel_url=f"{api}/api/payments/sslcommerz/cancel",
                ipn_url=f"{api}/api/payments/sslcommerz/ipn",
                reference=exchange_id,
            ))
        except GatewayError as exc:
            await self.repos.payments.finalize(tran_id, "FAILED", {"gateway_status": "SESSION_FAILED"})
            raise AppError("PAYMENT_GATEWAY_ERROR", str(exc)) from exc

        await self.repos.payments.set_session(tran_id, session.session_key)
        return PaymentStart(payment_id=payment.id, tran_id=tran_id, amount_bdt=amount, currency="BDT",
                            gateway_url=session.gateway_url, sandbox=self.gateway.sandbox)

    async def handle_return(self, kind: ReturnKind, fields: dict[str, str]) -> CallbackResult:
        """Process a gateway redirect / IPN. Never raises for bad input: returns an outcome."""
        if not self.enabled:
            return CallbackResult("invalid")
        tran_id = (fields.get("tran_id") or "").strip()
        payment = await self.repos.payments.get_by_tran_id(tran_id) if tran_id else None
        if payment is None:
            logger.warning("Payment callback for unknown tran_id %r (%s)", tran_id[:40], kind)
            return CallbackResult("invalid")
        result = lambda outcome: CallbackResult(outcome, payment.exchange_id, payment.payer_organization_id)  # noqa: E731

        if kind == "fail":
            await self.repos.payments.finalize(tran_id, "FAILED", {"gateway_status": fields.get("status") or "FAILED"})
            return result("success" if payment.status == "PAID" else "failed")
        if kind == "cancel":
            await self.repos.payments.finalize(tran_id, "CANCELLED", {"gateway_status": "CANCELLED"})
            return result("success" if payment.status == "PAID" else "cancelled")

        if payment.status == "PAID":
            return result("success")  # duplicate success/IPN: already recorded once
        val_id = (fields.get("val_id") or "").strip()
        if not val_id:
            return result("failed")
        try:
            v = await self.gateway.validate(val_id)
        except GatewayError:
            logger.warning("Payment validation unreachable for %s; left INITIATED for a later IPN", tran_id)
            return result("failed")

        if not (v.successful and v.tran_id == tran_id and v.currency == "BDT" and _same_amount(v.amount, payment.amount_bdt)):
            logger.warning("Payment %s rejected by validation (status=%s tran=%s amount=%s %s)",
                           tran_id, v.status, v.tran_id == tran_id, v.amount, v.currency)
            await self.repos.payments.finalize(tran_id, "FAILED", {"gateway_status": v.status, "val_id": v.val_id})
            return result("failed")

        updated = await self.repos.payments.finalize(tran_id, "PAID", {
            "val_id": v.val_id, "bank_tran_id": v.bank_tran_id, "card_type": v.card_type,
            "gateway_status": v.status, "paid_at": now_iso(),
        })
        if updated is None:
            latest = await self.repos.payments.get_by_tran_id(tran_id)
            return result("success" if latest and latest.status == "PAID" else "failed")
        logger.info("Payment %s PAID for exchange %s (%.2f BDT)", tran_id, payment.exchange_id, payment.amount_bdt)
        return result("success")

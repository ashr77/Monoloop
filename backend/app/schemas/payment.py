"""Payment records and API shapes (Member 4)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import Entity
from app.schemas.entities import IsoTime, Num

PaymentStatus = Literal["INITIATED", "PAID", "FAILED", "CANCELLED"]


class PaymentRecord(Entity):
    """One payment attempt (table `payments`, migration 00005)."""

    id: str
    exchange_id: str
    payer_organization_id: str
    provider: str = "SSLCOMMERZ"
    tran_id: str
    amount_bdt: Num
    currency: str = "BDT"
    status: PaymentStatus = "INITIATED"
    session_key: str | None = None
    val_id: str | None = None
    bank_tran_id: str | None = None
    card_type: str | None = None
    gateway_status: str | None = None
    paid_at: IsoTime | None = None
    created_at: IsoTime = ""
    updated_at: IsoTime = ""


class PaymentSummary(BaseModel):
    """What the exchange view shows about payment (no gateway internals)."""

    status: PaymentStatus
    provider: str
    tran_id: str
    amount_bdt: float
    card_type: str | None = None
    paid_at: str | None = None

    @classmethod
    def of(cls, p: PaymentRecord) -> PaymentSummary:
        return cls(status=p.status, provider=p.provider, tran_id=p.tran_id, amount_bdt=p.amount_bdt,
                   card_type=p.card_type, paid_at=p.paid_at)


class PaymentStart(BaseModel):
    """Response of POST /api/payments/exchanges/{id}: the browser goes to gateway_url."""

    payment_id: str
    tran_id: str
    amount_bdt: float
    currency: str
    gateway_url: str
    sandbox: bool

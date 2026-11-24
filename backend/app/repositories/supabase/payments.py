"""Supabase REST payments (table from migration 00007)."""

from __future__ import annotations

import httpx

from app.core.errors import AppError
from app.repositories.supabase.repositories import _in, _Rest
from app.schemas.payment import PaymentRecord

_COLUMNS = ("exchange_id", "payer_organization_id", "provider", "tran_id", "amount_bdt", "currency", "status")
_FINAL_FIELDS = ("val_id", "bank_tran_id", "card_type", "gateway_status", "paid_at")


class SupabasePaymentRepository:
    def __init__(self, client: httpx.AsyncClient):
        self.rest = _Rest(client)

    async def create(self, data: dict) -> PaymentRecord:
        return PaymentRecord.model_validate(await self.rest.insert("payments", {c: data[c] for c in _COLUMNS if c in data}))

    async def get_by_tran_id(self, tran_id: str) -> PaymentRecord | None:
        rows = await self.rest.get("payments", {"select": "*", "tran_id": f"eq.{tran_id}"})
        return PaymentRecord.model_validate(rows[0]) if rows else None

    async def for_exchanges(self, exchange_ids: list[str]) -> list[PaymentRecord]:
        if not exchange_ids:
            return []
        rows = await self.rest.get("payments", {"select": "*", "exchange_id": _in(exchange_ids), "order": "created_at.asc"})
        return [PaymentRecord.model_validate(r) for r in rows]

    async def set_session(self, tran_id: str, session_key: str) -> None:
        await self.rest.patch("payments", {"tran_id": f"eq.{tran_id}"}, {"session_key": session_key})

    async def finalize(self, tran_id: str, status: str, fields: dict) -> PaymentRecord | None:
        changes = {k: fields.get(k) for k in _FINAL_FIELDS} | {"status": status}
        try:
            # The status=eq.INITIATED filter makes the transition happen at most once.
            rows = await self.rest.patch("payments", {"tran_id": f"eq.{tran_id}", "status": "eq.INITIATED"}, changes)
        except AppError as exc:
            if exc.code == "DUPLICATE_EXCHANGE":  # unique index: exchange already has a PAID payment
                return None
            raise
        return PaymentRecord.model_validate(rows[0]) if rows else None

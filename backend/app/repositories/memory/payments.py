"""In-memory payments (demo mode and tests). Same rules as the database: unique tran_id, one PAID
payment per exchange, and INITIATED -> final status happens at most once (under the store lock)."""

from __future__ import annotations

import uuid

from app.core.errors import AppError
from app.repositories.memory.store import InMemoryStore
from app.schemas.entities import now_iso
from app.schemas.payment import PaymentRecord


class MemoryPaymentRepository:
    def __init__(self, store: InMemoryStore):
        self.s = store
        if not hasattr(store, "payments"):
            store.payments = {}

    @property
    def _rows(self) -> dict[str, PaymentRecord]:
        return self.s.payments  # keyed by tran_id

    async def create(self, data: dict) -> PaymentRecord:
        async with self.s.lock:
            if data["tran_id"] in self._rows:
                raise AppError("VALIDATION_ERROR", "Duplicate transaction id.")
            now = now_iso()
            rec = PaymentRecord.model_validate({**data, "id": str(uuid.uuid4()), "created_at": now, "updated_at": now})
            self._rows[rec.tran_id] = rec
            return rec.model_copy()

    async def get_by_tran_id(self, tran_id: str) -> PaymentRecord | None:
        rec = self._rows.get(tran_id)
        return rec.model_copy() if rec else None

    async def for_exchanges(self, exchange_ids: list[str]) -> list[PaymentRecord]:
        ids = set(exchange_ids)
        return [r.model_copy() for r in self._rows.values() if r.exchange_id in ids]

    async def set_session(self, tran_id: str, session_key: str) -> None:
        async with self.s.lock:
            if tran_id in self._rows:
                self._rows[tran_id].session_key = session_key

    async def finalize(self, tran_id: str, status: str, fields: dict) -> PaymentRecord | None:
        async with self.s.lock:
            rec = self._rows.get(tran_id)
            if rec is None or rec.status != "INITIATED":
                return None
            if status == "PAID" and any(
                r.exchange_id == rec.exchange_id and r.status == "PAID" for r in self._rows.values()
            ):
                return None  # the unique index uq_payments_paid_exchange in the database
            for key, value in fields.items():
                setattr(rec, key, value)
            rec.status = status
            rec.updated_at = now_iso()
            return rec.model_copy()

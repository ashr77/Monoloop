"""PostgreSQL payments (table from migration 00005). Static, parameterised SQL only."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.errors import AppError
from app.schemas.payment import PaymentRecord

_INSERT = text("""
    INSERT INTO payments (exchange_id, payer_organization_id, provider, tran_id, amount_bdt, currency, status)
    VALUES (CAST(:exchange_id AS uuid), CAST(:payer_organization_id AS uuid), :provider, :tran_id,
            :amount_bdt, :currency, :status)
    RETURNING *
""")

# INITIATED -> final status at most once; the partial unique index rejects a second PAID per exchange.
_FINALIZE = text("""
    UPDATE payments
       SET status = :status, val_id = :val_id, bank_tran_id = :bank_tran_id, card_type = :card_type,
           gateway_status = :gateway_status, paid_at = CAST(:paid_at AS timestamptz)
     WHERE tran_id = :tran_id AND status = 'INITIATED'
    RETURNING *
""")


class PgPaymentRepository:
    def __init__(self, engine: AsyncEngine):
        self.engine = engine

    async def create(self, data: dict) -> PaymentRecord:
        params = {k: data.get(k) for k in ("exchange_id", "payer_organization_id", "provider", "tran_id",
                                           "amount_bdt", "currency", "status")}
        try:
            async with self.engine.begin() as conn:
                row = (await conn.execute(_INSERT, params)).one()
        except IntegrityError as exc:
            raise AppError("VALIDATION_ERROR", "Payment could not be recorded.") from exc
        return PaymentRecord.model_validate(dict(row._mapping))

    async def get_by_tran_id(self, tran_id: str) -> PaymentRecord | None:
        async with self.engine.connect() as conn:
            row = (await conn.execute(text("SELECT * FROM payments WHERE tran_id = :t"), {"t": tran_id})).first()
        return PaymentRecord.model_validate(dict(row._mapping)) if row else None

    async def for_exchanges(self, exchange_ids: list[str]) -> list[PaymentRecord]:
        if not exchange_ids:
            return []
        sql = text("SELECT * FROM payments WHERE exchange_id = ANY(CAST(:ids AS uuid[])) ORDER BY created_at")
        async with self.engine.connect() as conn:
            rows = await conn.execute(sql, {"ids": exchange_ids})
        return [PaymentRecord.model_validate(dict(r._mapping)) for r in rows]

    async def set_session(self, tran_id: str, session_key: str) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(text("UPDATE payments SET session_key = :k WHERE tran_id = :t"),
                               {"k": session_key, "t": tran_id})

    async def finalize(self, tran_id: str, status: str, fields: dict) -> PaymentRecord | None:
        params = {k: fields.get(k) for k in ("val_id", "bank_tran_id", "card_type", "gateway_status", "paid_at")}
        try:
            async with self.engine.begin() as conn:
                row = (await conn.execute(_FINALIZE, {**params, "status": status, "tran_id": tran_id})).first()
        except IntegrityError:
            return None  # another payment for this exchange is already PAID
        return PaymentRecord.model_validate(dict(row._mapping)) if row else None

"""PostgreSQL implementations of the repository interfaces (SQLAlchemy Core, asyncpg).

Design notes
- Every query is parameterised (no string-built SQL, unlike the old PostgREST `.or()` filter).
- One round trip per read: joins for listing/requirement + organization, and a single JSON
  aggregate query for the full exchange read model (the old code needed 5 requests).
- Exchange state changes call the PL/pgSQL functions from migration 00004, so each one is a
  single atomic transaction with row locks taken in a fixed order (no over-allocation).
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.errors import ERROR_STATUS, AppError
from app.repositories.base import (
    ExchangeActionName,
    ExchangeFilter,
    ExchangeStatistics,
    ListingFilter,
    NewExchangeItem,
    RequirementFilter,
)
from app.repositories.postgres.tables import listings, organizations, requirements
from app.schemas.entities import (
    ActivityLog,
    ExchangeItemRecord,
    ExchangeRecord,
    Listing,
    Organization,
    Requirement,
    is_uuid,
)
from app.schemas.exchange import ExchangeView, build_view

_ORG_COLS = [c.label(f"org__{c.name}") for c in organizations.c]


def _split_org(row: Any) -> tuple[dict, Organization | None]:
    data = dict(row._mapping)
    org = {k[5:]: data.pop(k) for k in list(data) if k.startswith("org__")}
    return data, (Organization.model_validate(org) if org.get("id") else None)


def _listing(row: Any) -> Listing:
    data, org = _split_org(row)
    return Listing.model_validate({**data, "organization": org})


def _requirement(row: Any) -> Requirement:
    data, org = _split_org(row)
    return Requirement.model_validate({**data, "organization": org})


_DB_ERROR = re.compile(r"MONOLOOP:([A-Z_]+):(.*)", re.S)


def translate_db_error(exc: Exception) -> AppError:
    """Map PL/pgSQL 'MONOLOOP:<CODE>:<message>' exceptions and constraint violations to AppError."""
    orig = getattr(exc, "orig", exc)
    message = str(orig)
    m = _DB_ERROR.search(message)
    if m and m.group(1) in ERROR_STATUS:
        return AppError(m.group(1), m.group(2).strip().splitlines()[0])
    code = getattr(orig, "sqlstate", None) or getattr(getattr(orig, "__cause__", None), "sqlstate", None)
    if code == "23505":
        return AppError("DUPLICATE_EXCHANGE", "An active exchange already exists for this requirement.")
    if code == "23514":
        return AppError("INSUFFICIENT_STOCK", "Inventory constraint rejected the change.")
    return AppError("INTERNAL_ERROR", "Database error.")


class PgOrganizationRepository:
    def __init__(self, engine: AsyncEngine):
        self.engine = engine

    async def list(self) -> list[Organization]:
        async with self.engine.connect() as conn:
            rows = await conn.execute(select(organizations).order_by(organizations.c.name))
        return [Organization.model_validate(dict(r._mapping)) for r in rows]

    async def get(self, organization_id: str) -> Organization | None:
        if not is_uuid(organization_id):
            return None
        async with self.engine.connect() as conn:
            row = (await conn.execute(select(organizations).where(organizations.c.id == organization_id))).first()
        return Organization.model_validate(dict(row._mapping)) if row else None


class PgListingRepository:
    def __init__(self, engine: AsyncEngine):
        self.engine = engine

    def _select(self):
        return select(listings, *_ORG_COLS).select_from(
            listings.outerjoin(organizations, organizations.c.id == listings.c.organization_id)
        )

    async def list(self, f: ListingFilter) -> list[Listing]:
        q = self._select()
        if f.organization_id:
            if not is_uuid(f.organization_id):
                return []
            q = q.where(listings.c.organization_id == f.organization_id)
        if f.material_family:
            q = q.where(listings.c.material_family == f.material_family)
        if f.material_families is not None:
            q = q.where(listings.c.material_family.in_(f.material_families))
        if f.status:
            q = q.where(listings.c.status == f.status)
        if f.search:
            # Escape LIKE wildcards so user input is matched literally.
            term = "%" + f.search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            q = q.where(or_(
                listings.c.description.ilike(term, escape="\\"),
                listings.c.material_specification.ilike(term, escape="\\"),
                listings.c.city.ilike(term, escape="\\"),
            ))
        async with self.engine.connect() as conn:
            rows = await conn.execute(q.order_by(listings.c.created_at.desc()))
        return [_listing(r) for r in rows]

    async def get(self, listing_id: str) -> Listing | None:
        if not is_uuid(listing_id):
            return None
        async with self.engine.connect() as conn:
            row = (await conn.execute(self._select().where(listings.c.id == listing_id))).first()
        return _listing(row) if row else None

    async def create(self, data: dict) -> Listing:
        values = {**data, "id": str(uuid.uuid4()), "reserved_quantity": 0}
        async with self.engine.begin() as conn:
            row = (await conn.execute(listings.insert().values(**values).returning(listings))).first()
        return Listing.model_validate(dict(row._mapping))

    async def update(self, listing_id: str, changes: dict) -> Listing | None:
        if not is_uuid(listing_id):
            return None
        conds = [listings.c.id == listing_id]
        if "total_quantity" in changes:
            # Atomic guard: never drop total below what is currently reserved.
            conds.append(listings.c.reserved_quantity <= changes["total_quantity"])
        stmt = (update(listings).where(and_(*conds))
                .values(**changes, updated_at=func.now()).returning(listings))
        try:
            async with self.engine.begin() as conn:
                row = (await conn.execute(stmt)).first()
        except IntegrityError as exc:
            raise AppError("INVALID_QUANTITY", "Total quantity cannot be lower than reserved quantity.") from exc
        if row is None:
            existing = await self.get(listing_id)
            if existing is None:
                return None
            raise AppError("INVALID_QUANTITY", f"Cannot reduce total quantity ({changes['total_quantity']}) below "
                                               f"active reserved quantity ({existing.reserved_quantity}).")
        return Listing.model_validate(dict(row._mapping))


class PgRequirementRepository:
    def __init__(self, engine: AsyncEngine):
        self.engine = engine

    def _select(self):
        return select(requirements, *_ORG_COLS).select_from(
            requirements.outerjoin(organizations, organizations.c.id == requirements.c.organization_id)
        )

    async def list(self, f: RequirementFilter) -> list[Requirement]:
        q = self._select()
        if f.organization_id:
            if not is_uuid(f.organization_id):
                return []
            q = q.where(requirements.c.organization_id == f.organization_id)
        if f.material_family:
            q = q.where(requirements.c.material_family == f.material_family)
        if f.status:
            q = q.where(requirements.c.status == f.status)
        async with self.engine.connect() as conn:
            rows = await conn.execute(q.order_by(requirements.c.created_at.desc()))
        return [_requirement(r) for r in rows]

    async def get(self, requirement_id: str) -> Requirement | None:
        if not is_uuid(requirement_id):
            return None
        async with self.engine.connect() as conn:
            row = (await conn.execute(self._select().where(requirements.c.id == requirement_id))).first()
        return _requirement(row) if row else None

    async def create(self, data: dict) -> Requirement:
        async with self.engine.begin() as conn:
            row = (await conn.execute(requirements.insert().values(**data).returning(requirements))).first()
        return Requirement.model_validate(dict(row._mapping))

    async def update(self, requirement_id: str, changes: dict) -> Requirement | None:
        if not is_uuid(requirement_id):
            return None
        stmt = update(requirements).where(requirements.c.id == requirement_id).values(**changes).returning(requirements)
        async with self.engine.begin() as conn:
            row = (await conn.execute(stmt)).first()
        return Requirement.model_validate(dict(row._mapping)) if row else None

    async def exchange_statistics(self, requirement_ids: list[str]) -> ExchangeStatistics:
        ids = [i for i in requirement_ids if is_uuid(i)]
        if not ids:
            return ExchangeStatistics()
        sql = text("""
            SELECT
              (SELECT coalesce(json_agg(DISTINCT e.requirement_id), '[]'::json)
                 FROM exchanges e
                WHERE e.status = 'PROPOSED' AND e.requirement_id = ANY(CAST(:ids AS uuid[]))) AS pending,
              (SELECT coalesce(json_object_agg(t.requirement_id, t.qty), '{}'::json)
                 FROM (SELECT e.requirement_id, sum(i.quantity) AS qty
                         FROM exchange_items i JOIN exchanges e ON e.id = i.exchange_id
                        WHERE i.status = 'COMPLETED' AND e.status IN ('IN_PROGRESS', 'COMPLETED')
                          AND e.requirement_id = ANY(CAST(:ids AS uuid[]))
                        GROUP BY e.requirement_id) t) AS fulfilled
        """)
        async with self.engine.connect() as conn:
            row = (await conn.execute(sql, {"ids": ids})).one()
        pending, fulfilled = _json(row.pending), _json(row.fulfilled)
        return ExchangeStatistics(sorted(pending), {k: int(v) for k, v in fulfilled.items()})


def _json(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


# Full exchange read model in ONE round trip.
_EXCHANGE_VIEWS_SQL = text("""
WITH ex AS (
    SELECT e.* FROM exchanges e
     WHERE (CAST(:exchange_id AS uuid) IS NULL OR e.id = CAST(:exchange_id AS uuid))
       AND (CAST(:status AS text) IS NULL OR e.status = CAST(:status AS text))
       AND (CAST(:org AS uuid) IS NULL
            OR e.buyer_organization_id = CAST(:org AS uuid)
            OR EXISTS (SELECT 1 FROM exchange_items i
                        WHERE i.exchange_id = e.id AND i.supplier_organization_id = CAST(:org AS uuid)))
), it AS (
    SELECT i.* FROM exchange_items i WHERE i.exchange_id IN (SELECT id FROM ex)
)
SELECT
  (SELECT coalesce(json_agg(ex ORDER BY ex.created_at DESC), '[]'::json) FROM ex) AS exchanges,
  (SELECT coalesce(json_agg(it), '[]'::json) FROM it) AS items,
  (SELECT coalesce(json_agg(a), '[]'::json) FROM activity_logs a WHERE a.exchange_id IN (SELECT id FROM ex)) AS logs,
  (SELECT coalesce(json_agg(l), '[]'::json) FROM listings l WHERE l.id IN (SELECT listing_id FROM it)) AS listings,
  (SELECT coalesce(json_agg(r), '[]'::json) FROM requirements r WHERE r.id IN (SELECT requirement_id FROM ex)) AS requirements,
  (SELECT coalesce(json_agg(o), '[]'::json) FROM organizations o
     WHERE o.id IN (SELECT buyer_organization_id FROM ex UNION SELECT supplier_organization_id FROM it)) AS organizations
""")

_ACTIONS = {
    "accept": "SELECT accept_exchange_item(CAST(:item AS uuid), CAST(:actor AS uuid))",
    "reject": "SELECT reject_exchange_item(CAST(:item AS uuid), CAST(:actor AS uuid))",
    "complete": "SELECT complete_exchange(CAST(:exchange AS uuid), CAST(:actor AS uuid))",
    "cancel": "SELECT cancel_exchange(CAST(:exchange AS uuid), CAST(:actor AS uuid))",
}


class PgExchangeRepository:
    def __init__(self, engine: AsyncEngine):
        self.engine = engine

    async def _views(self, exchange_id: str | None = None, f: ExchangeFilter | None = None) -> list[ExchangeView]:
        f = f or ExchangeFilter()
        if f.organization_id and not is_uuid(f.organization_id):
            return []
        params = {"exchange_id": exchange_id, "status": f.status, "org": f.organization_id}
        async with self.engine.connect() as conn:
            row = (await conn.execute(_EXCHANGE_VIEWS_SQL, params)).one()
        exchanges = [ExchangeRecord.model_validate(e) for e in _json(row.exchanges)]
        items = [ExchangeItemRecord.model_validate(i) for i in _json(row.items)]
        logs = [ActivityLog.model_validate(a) for a in _json(row.logs)]
        lst = {l["id"]: Listing.model_validate(l) for l in _json(row.listings)}
        reqs = {r["id"]: Requirement.model_validate(r) for r in _json(row.requirements)}
        orgs = {o["id"]: Organization.model_validate(o) for o in _json(row.organizations)}
        by_ex: dict[str, list[ExchangeItemRecord]] = {}
        for i in items:
            by_ex.setdefault(i.exchange_id, []).append(i)
        logs_by_ex: dict[str, list[ActivityLog]] = {}
        for a in logs:
            logs_by_ex.setdefault(a.exchange_id or "", []).append(a)
        return [build_view(e, by_ex.get(e.id, []), logs_by_ex.get(e.id, []), lst, reqs, orgs) for e in exchanges]

    async def list(self, f: ExchangeFilter) -> list[ExchangeView]:
        return await self._views(None, f)

    async def get(self, exchange_id: str) -> ExchangeView | None:
        if not is_uuid(exchange_id):
            return None
        views = await self._views(exchange_id)
        return views[0] if views else None

    async def create(self, requirement_id: str, buyer_id: str, items: list[NewExchangeItem]) -> str:
        payload = json.dumps([{"listing_id": i.listing_id, "quantity": i.quantity} for i in items])
        sql = text("SELECT create_exchange_request(CAST(:req AS uuid), CAST(:buyer AS uuid), CAST(:items AS jsonb))")
        try:
            async with self.engine.begin() as conn:
                return str((await conn.execute(sql, {"req": requirement_id, "buyer": buyer_id, "items": payload})).scalar_one())
        except DBAPIError as exc:
            raise translate_db_error(exc) from exc

    async def act(self, action: ExchangeActionName, exchange_id: str, actor_id: str, item_id: str | None) -> None:
        if not is_uuid(exchange_id):
            raise AppError("NOT_FOUND", f"Exchange {exchange_id} was not found.")
        try:
            async with self.engine.begin() as conn:
                if action in ("accept", "reject"):
                    belongs = (await conn.execute(
                        text("SELECT 1 FROM exchange_items WHERE id = CAST(:item AS uuid) AND exchange_id = CAST(:ex AS uuid)"),
                        {"item": item_id, "ex": exchange_id},
                    )).first()
                    if not belongs:
                        raise AppError("NOT_FOUND", f"Exchange item {item_id} was not found in exchange {exchange_id}.")
                await conn.execute(text(_ACTIONS[action]), {"item": item_id, "exchange": exchange_id, "actor": actor_id})
        except DBAPIError as exc:
            raise translate_db_error(exc) from exc

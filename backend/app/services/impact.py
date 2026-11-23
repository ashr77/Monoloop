"""Resource recovery analytics (Member 4).

Only COMPLETED exchange items count as reuse. Proposed or reserved exchanges are reported
separately as "pipeline". Mass figures are indicative estimates from nominal dimensions.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.repositories.base import ExchangeFilter, ListingFilter, Repositories
from app.schemas.entities import Listing
from app.schemas.exchange import ExchangeView

DENSITY_KG_PER_M3 = {"STAINLESS_STEEL_SHEET": 7930, "PLYWOOD_PANEL": 600}
_FAMILY_LABEL = {"STAINLESS_STEEL_SHEET": "Stainless steel sheet", "PLYWOOD_PANEL": "Plywood panel"}


def estimate_piece_mass_kg(family: str, length_mm: float, width_mm: float, thickness_mm: float) -> float:
    return (length_mm * width_mm * thickness_mm) / 1e9 * DENSITY_KG_PER_M3[family]


class Recovered(BaseModel):
    completed_exchanges: int = 0
    transferred_units: int = 0
    transferred_value_bdt: float = 0
    estimated_mass_kg: float = 0
    fulfilled_requirements: int = 0
    multi_supplier_exchanges: int = 0


class Pipeline(BaseModel):
    awaiting_suppliers: int = 0
    reserved_exchanges: int = 0
    reserved_units: int = 0
    reserved_value_bdt: float = 0
    cancelled_exchanges: int = 0


class Inventory(BaseModel):
    active_listings: int = 0
    available_units: int = 0
    reserved_units: int = 0
    available_value_bdt: float = 0


class FamilyBreakdown(BaseModel):
    material_family: str
    units: int = 0
    value_bdt: float = 0
    mass_kg: float = 0


class SupplierContribution(BaseModel):
    organization_id: str
    name: str
    units: int = 0
    value_bdt: float = 0
    exchanges: int = 0


class CompletedExchangeSummary(BaseModel):
    id: str
    completed_at: str
    buyer_name: str
    material: str
    units: int
    value_bdt: float
    suppliers: list[str]


class ImpactReport(BaseModel):
    scope: dict[str, str | None]
    recovered: Recovered
    pipeline: Pipeline
    inventory: Inventory
    by_family: list[FamilyBreakdown]
    top_suppliers: list[SupplierContribution]
    recent_completed: list[CompletedExchangeSummary]
    assumptions: list[str]


def compute_impact(exchanges: list[ExchangeView], listings: list[Listing], organization_id: str | None) -> ImpactReport:
    def in_scope(ex: ExchangeView, supplier_id: str) -> bool:
        return not organization_id or ex.buyer_organization_id == organization_id or supplier_id == organization_id

    recovered, pipeline = Recovered(), Pipeline()
    families: dict[str, FamilyBreakdown] = {}
    suppliers: dict[str, tuple[SupplierContribution, set[str]]] = {}
    fulfilled: set[str] = set()
    recent: list[CompletedExchangeSummary] = []

    for ex in exchanges:
        if ex.stage in ("AWAITING_SUPPLIERS", "SUPPLIER_DECLINED"):
            pipeline.awaiting_suppliers += 1
        if ex.stage == "CANCELLED":
            pipeline.cancelled_exchanges += 1
        if ex.stage == "RESERVED":
            pipeline.reserved_exchanges += 1
        if ex.status in ("PROPOSED", "IN_PROGRESS"):
            for item in ex.items:
                if item.status == "ACCEPTED" and in_scope(ex, item.supplier_organization_id):
                    pipeline.reserved_units += item.quantity
                    pipeline.reserved_value_bdt += item.subtotal_bdt
        if ex.status != "COMPLETED":
            continue
        done = [i for i in ex.items if i.status == "COMPLETED" and in_scope(ex, i.supplier_organization_id)]
        if not done:
            continue
        recovered.completed_exchanges += 1
        if len({i.supplier_organization_id for i in ex.items}) > 1:
            recovered.multi_supplier_exchanges += 1
        if ex.requirement and ex.requirement.status == "FULFILLED" and ex.requirement_id:
            fulfilled.add(ex.requirement_id)

        units, value = 0, 0.0
        for item in done:
            l = item.listing
            family = (l.material_family if l else None) or (ex.requirement.material_family if ex.requirement else None)
            mass = estimate_piece_mass_kg(family, l.length_mm, l.width_mm, l.thickness_mm) * item.quantity \
                if l and family else 0.0
            recovered.transferred_units += item.quantity
            recovered.transferred_value_bdt += item.subtotal_bdt
            recovered.estimated_mass_kg += mass
            units += item.quantity
            value += item.subtotal_bdt
            if family:
                fb = families.setdefault(family, FamilyBreakdown(material_family=family))
                fb.units += item.quantity
                fb.value_bdt += item.subtotal_bdt
                fb.mass_kg += mass
            contrib, ids = suppliers.setdefault(item.supplier_organization_id, (SupplierContribution(
                organization_id=item.supplier_organization_id,
                name=item.supplier.name if item.supplier else "Unknown supplier"), set()))
            contrib.units += item.quantity
            contrib.value_bdt += item.subtotal_bdt
            ids.add(ex.id)

        req = ex.requirement
        recent.append(CompletedExchangeSummary(
            id=ex.id,
            completed_at=ex.updated_at,
            buyer_name=ex.buyer.name if ex.buyer else "Unknown buyer",
            material=(f"{_FAMILY_LABEL.get(req.material_family, req.material_family)} · {req.material_specification}"
                      if req else "Material"),
            units=units,
            value_bdt=value,
            suppliers=list(dict.fromkeys(i.supplier.name if i.supplier else "Unknown supplier" for i in done)),
        ))
    recovered.fulfilled_requirements = len(fulfilled)

    inventory = Inventory()
    for l in listings:
        if organization_id and l.organization_id != organization_id:
            continue
        if l.status != "ACTIVE":
            continue
        inventory.active_listings += 1
        inventory.available_units += l.total_quantity - l.reserved_quantity
        inventory.reserved_units += l.reserved_quantity
        inventory.available_value_bdt += (l.total_quantity - l.reserved_quantity) * l.unit_price_bdt

    top = []
    for contrib, ids in suppliers.values():
        contrib.exchanges = len(ids)
        top.append(contrib)

    return ImpactReport(
        scope={"organization_id": organization_id},
        recovered=recovered,
        pipeline=pipeline,
        inventory=inventory,
        by_family=sorted(families.values(), key=lambda f: -f.value_bdt),
        top_suppliers=sorted(top, key=lambda s: -s.value_bdt),
        recent_completed=sorted(recent, key=lambda r: r.completed_at, reverse=True)[:8],
        assumptions=[
            "Only exchanges confirmed as COMPLETED count as reuse; proposed or reserved stock is shown as pipeline only.",
            "Value is the supplier unit price captured when the exchange was requested, in BDT, excluding transport.",
            f"Mass is an indicative estimate from nominal dimensions: stainless steel "
            f"{DENSITY_KG_PER_M3['STAINLESS_STEEL_SHEET']} kg/m³, plywood {DENSITY_KG_PER_M3['PLYWOOD_PANEL']} kg/m³.",
            "All organizations and transactions in this prototype are simulated; figures are not real environmental savings.",
        ],
    )


class ImpactService:
    def __init__(self, repos: Repositories):
        self.repos = repos

    async def report(self, organization_id: str | None) -> ImpactReport:
        exchanges = await self.repos.exchanges.list(ExchangeFilter(organization_id=organization_id))
        listings = await self.repos.listings.list(ListingFilter(organization_id=organization_id))
        return compute_impact(exchanges, listings, organization_id)

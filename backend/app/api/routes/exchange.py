"""Exchanges and resource-recovery analytics (Member 4)."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Body, Path, Query, Request, status

from app.api.deps import ContainerDep
from app.core.errors import AppError
from app.core.security import require_actor, require_admin, resolve_actor
from app.domain.constants import ExchangeStatus
from app.schemas.common import ApiResponse, ok
from app.schemas.exchange import ExchangeView
from app.schemas.inputs import ExchangeAction, ExchangeCreate
from app.services.impact import ImpactReport

router = APIRouter(prefix="/api", tags=["exchanges"])
IdPath = Annotated[str, Path(max_length=64)]


@router.get("/exchanges", response_model=ApiResponse[list[ExchangeView]])
async def list_exchanges(
    request: Request,
    c: ContainerDep,
    organization_id: Annotated[str | None, Query(max_length=64)] = None,
    status_: Annotated[ExchangeStatus | None, Query(alias="status")] = None,
):
    """Exchanges where the organization is the buyer or supplies at least one item.
    With AUTH_MODE=jwt a company always gets its own exchanges; admins may filter freely."""
    if c.settings.auth_mode == "jwt":
        actor = await resolve_actor(request, c.settings)
        if actor is not None:  # company (admins: actor None, keep the requested filter)
            organization_id = actor
    views = await c.exchanges.list(organization_id or None, status_)
    return ok(views, total=len(views))


@router.post("/exchanges", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[ExchangeView])
async def request_exchange(body: ExchangeCreate, request: Request, c: ContainerDep):
    """Request an exchange for a requirement or directly for a supply listing."""
    actor = await resolve_actor(request, c.settings)
    if actor and actor != body.buyer_organization_id:
        raise AppError("FORBIDDEN_ORGANIZATION", "You can only request exchanges for your own organization.")
    if body.listing_id is not None:
        view = await c.exchanges.request_listing(body.listing_id, body.quantity, body.buyer_organization_id)
        return ok(view)
    if body.requirement_id is None:
        raise AppError("VALIDATION_ERROR", "listing_id and quantity are required for direct supply orders.")
    view, proposal = await c.exchanges.request_from_match(body.requirement_id, body.buyer_organization_id)
    return ok(view, matching_status=proposal.matching_status, unfulfilled_quantity=proposal.unfulfilled_quantity)


@router.get("/exchanges/{exchange_id}", response_model=ApiResponse[ExchangeView])
async def get_exchange(exchange_id: IdPath, c: ContainerDep):
    return ok(await c.exchanges.get(exchange_id))


@router.post("/exchanges/{exchange_id}/{action}", response_model=ApiResponse[ExchangeView])
async def act_on_exchange(
    exchange_id: IdPath,
    action: Literal["accept", "reject", "complete", "cancel"],
    request: Request,
    c: ContainerDep,
    body: Annotated[ExchangeAction | None, Body()] = None,
):
    """accept / reject: the item's supplier (body: exchange_item_id). complete / cancel: the buyer.
    Acting organization: X-Organization-Id header."""
    body = body or ExchangeAction()
    actor = await require_actor(request, c.settings, body.actor_organization_id)
    return ok(await c.exchanges.act(action, exchange_id, actor, body.exchange_item_id))


@router.get("/impact", response_model=ApiResponse[ImpactReport], tags=["impact"])
async def impact(request: Request, c: ContainerDep,
                 organization_id: Annotated[str | None, Query(max_length=64)] = None):
    """Only COMPLETED exchanges count as reuse. With AUTH_MODE=jwt: admins only (platform-wide data)."""
    if c.settings.auth_mode == "jwt":
        await require_admin(request)
    return ok(await c.impact.report(organization_id or None))

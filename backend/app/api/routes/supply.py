"""Organizations and surplus listings (Member 1)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from app.api.deps import ContainerDep
from app.core.security import require_actor
from app.domain.constants import ListingStatus, MaterialFamily
from app.repositories.base import ListingFilter
from app.schemas.common import ApiResponse, ok
from app.schemas.entities import Listing, Organization
from app.schemas.inputs import ListingCreate, ListingUpdate

router = APIRouter(prefix="/api", tags=["supply"])
IdPath = Annotated[str, Path(max_length=64)]


@router.get("/organizations", response_model=ApiResponse[list[Organization]])
async def list_organizations(c: ContainerDep):
    """Demo supplier and buyer organizations."""
    return ok(await c.organizations.list())


@router.get("/listings", response_model=ApiResponse[list[Listing]])
async def list_listings(
    c: ContainerDep,
    organization_id: Annotated[str | None, Query(max_length=64)] = None,
    material_family: MaterialFamily | None = None,
    status_: Annotated[ListingStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
):
    listings = await c.listings.list(ListingFilter(
        organization_id=organization_id or None, material_family=material_family,
        status=status_, search=(search or "").strip() or None,
    ))
    return ok(listings, total=len(listings))


@router.post("/listings", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[Listing])
async def create_listing(body: ListingCreate, request: Request, c: ContainerDep):
    """Publish surplus stock. `reserved_quantity` always starts at 0."""
    actor = await require_actor(request, c.settings)
    return ok(await c.listings.create(body, actor))


@router.get("/listings/{listing_id}", response_model=ApiResponse[Listing])
async def get_listing(listing_id: IdPath, c: ContainerDep):
    return ok(await c.listings.get(listing_id))


@router.patch("/listings/{listing_id}", response_model=ApiResponse[Listing])
async def update_listing(listing_id: IdPath, body: ListingUpdate, request: Request, c: ContainerDep):
    """Edit or archive a listing. Only the owner may change it; reserved stock is never editable."""
    actor = await require_actor(request, c.settings, body.caller_organization_id)
    return ok(await c.listings.update(listing_id, body, actor))

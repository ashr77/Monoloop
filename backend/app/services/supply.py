"""Supply (Member 1): organizations and surplus listings."""

from __future__ import annotations

from app.core.errors import AppError
from app.domain.constants import is_specification_valid_for_family
from app.repositories.base import ListingFilter, Repositories
from app.schemas.entities import Listing, Organization
from app.schemas.inputs import ListingCreate, ListingUpdate


class OrganizationService:
    def __init__(self, repos: Repositories):
        self.repos = repos

    async def list(self) -> list[Organization]:
        # Public directory: approved companies only (pending applicants stay private).
        return [o for o in await self.repos.organizations.list() if o.status == "APPROVED"]


class ListingService:
    def __init__(self, repos: Repositories):
        self.repos = repos

    async def list(self, f: ListingFilter) -> list[Listing]:
        return await self.repos.listings.list(f)

    async def get(self, listing_id: str) -> Listing:
        listing = await self.repos.listings.get(listing_id)
        if not listing:
            raise AppError("NOT_FOUND", f"Listing with ID '{listing_id}' was not found.")
        return listing

    async def create(self, data: ListingCreate, actor_id: str) -> Listing:
        if data.organization_id != actor_id:
            raise AppError("FORBIDDEN_ORGANIZATION", "You can only publish listings for your own organization.")
        org = await self.repos.organizations.get(data.organization_id)
        if not org:
            raise AppError("NOT_FOUND", f"Supplier organization '{data.organization_id}' not found.")
        if org.organization_type not in ("SUPPLIER", "HYBRID"):
            raise AppError("FORBIDDEN_ROLE", f"Organization '{org.name}' is registered as {org.organization_type}. "
                                             "Only SUPPLIER organizations may publish surplus inventory.")
        listing = await self.repos.listings.create(data.model_dump())
        listing.organization = org
        return listing

    async def update(self, listing_id: str, data: ListingUpdate, actor_id: str) -> Listing:
        existing = await self.get(listing_id)
        if actor_id != existing.organization_id:
            raise AppError("FORBIDDEN_ORGANIZATION",
                           "Access denied: You cannot modify a surplus listing owned by another organization.")
        if "reserved_quantity" in data.model_fields_set:
            raise AppError("FORBIDDEN_FIELD", "Direct modification of reserved_quantity is strictly forbidden.")
        if data.organization_id is not None and data.organization_id != existing.organization_id:
            raise AppError("FORBIDDEN_FIELD", "Reassigning listing ownership across organizations is not permitted.")
        changes = data.changes()
        family = changes.get("material_family", existing.material_family)
        spec = changes.get("material_specification", existing.material_specification)
        if not is_specification_valid_for_family(family, spec):
            raise AppError("VALIDATION_ERROR", "Invalid specification for selected material family",
                           [{"field": "material_specification", "message": "Invalid for the material family"}])
        total = changes.get("total_quantity")
        if total is not None and total < existing.reserved_quantity:
            raise AppError("INVALID_QUANTITY", f"Cannot reduce total quantity ({total}) below active reserved "
                                               f"quantity ({existing.reserved_quantity}).")
        if not changes:
            return existing
        updated = await self.repos.listings.update(listing_id, changes)
        if not updated:
            raise AppError("NOT_FOUND", f"Listing with ID '{listing_id}' was not found.")
        updated.organization = existing.organization
        return updated

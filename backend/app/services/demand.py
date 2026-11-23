"""Demand (Member 2): buyer requirements."""

from __future__ import annotations

from app.core.errors import AppError
from app.domain.constants import is_specification_valid_for_family
from app.repositories.base import ExchangeStatistics, Repositories, RequirementFilter
from app.schemas.entities import Requirement
from app.schemas.inputs import RequirementCreate, RequirementUpdate


class RequirementService:
    def __init__(self, repos: Repositories):
        self.repos = repos

    async def list(self, f: RequirementFilter) -> tuple[list[Requirement], ExchangeStatistics]:
        requirements = await self.repos.requirements.list(f)
        stats = await self.repos.requirements.exchange_statistics([r.id for r in requirements])
        return requirements, stats

    async def get(self, requirement_id: str) -> Requirement:
        req = await self.repos.requirements.get(requirement_id)
        if not req:
            raise AppError("NOT_FOUND", f"Requirement '{requirement_id}' was not found.")
        return req

    async def create(self, data: RequirementCreate, actor_id: str) -> Requirement:
        if data.organization_id != actor_id:
            raise AppError("FORBIDDEN_ORGANIZATION", "You can only publish requirements for your own organization.")
        org = await self.repos.organizations.get(data.organization_id)
        if not org:
            raise AppError("NOT_FOUND", f"Buyer organization '{data.organization_id}' not found.")
        if org.organization_type not in ("BUYER", "HYBRID"):
            raise AppError("FORBIDDEN_ROLE", f"Organization '{org.name}' is registered as {org.organization_type}. "
                                             "Only BUYER organizations may publish requirements.")
        req = await self.repos.requirements.create(data.model_dump())
        req.organization = org
        return req

    async def update(self, requirement_id: str, data: RequirementUpdate, actor_id: str) -> Requirement:
        existing = await self.get(requirement_id)
        if existing.status in ("FULFILLED", "CANCELLED"):
            raise AppError("IMMUTABLE_STATUS", f"A {existing.status.lower()} requirement cannot be modified.")
        if actor_id != existing.organization_id:
            raise AppError("FORBIDDEN_ORGANIZATION",
                           "Access denied: You cannot modify a requirement owned by another organization.")
        if data.organization_id is not None and data.organization_id != existing.organization_id:
            raise AppError("FORBIDDEN_FIELD", "Reassigning requirement ownership is not permitted.")
        changes = data.changes()
        family = changes.get("material_family", existing.material_family)
        spec = changes.get("material_specification", existing.material_specification)
        if not is_specification_valid_for_family(family, spec):
            raise AppError("VALIDATION_ERROR", "Invalid specification for selected material family",
                           [{"field": "material_specification", "message": "Invalid for the material family"}])
        if not changes:
            return existing
        updated = await self.repos.requirements.update(requirement_id, changes)
        if not updated:
            raise AppError("NOT_FOUND", f"Requirement '{requirement_id}' was not found.")
        updated.organization = existing.organization
        return updated

"""Buyer requirements (Member 2)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from app.api.deps import ContainerDep
from app.core.security import require_actor, resolve_actor
from app.core.errors import AppError
from app.domain.constants import MaterialFamily, RequirementStatus
from app.repositories.base import RequirementFilter
from app.schemas.common import ApiResponse, ok
from app.schemas.entities import Requirement
from app.schemas.inputs import RequirementCreate, RequirementUpdate

router = APIRouter(prefix="/api", tags=["demand"])
IdPath = Annotated[str, Path(max_length=64)]


@router.get("/requirements", response_model=ApiResponse[list[Requirement]])
async def list_requirements(
    c: ContainerDep,
    request: Request,
    organization_id: Annotated[str | None, Query(max_length=64)] = None,
    material_family: MaterialFamily | None = None,
    status_: Annotated[RequirementStatus | None, Query(alias="status")] = None,
):
    actor = await resolve_actor(request, c.settings)
    if actor:
        organization_id = actor
    reqs, stats = await c.requirements.list(RequirementFilter(organization_id or None, material_family, status_))
    return ok(
        reqs,
        total=len(reqs),
        pending_match_requirement_ids=stats.pending_match_requirement_ids,
        fulfilled_quantities_by_requirement=stats.fulfilled_quantities,
    )


@router.post("/requirements", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[Requirement])
async def create_requirement(body: RequirementCreate, request: Request, c: ContainerDep):
    actor = await require_actor(request, c.settings)
    return ok(await c.requirements.create(body, actor))


@router.get("/requirements/{requirement_id}", response_model=ApiResponse[Requirement])
async def get_requirement(requirement_id: IdPath, request: Request, c: ContainerDep):
    actor = await resolve_actor(request, c.settings)
    requirement = await c.requirements.get(requirement_id)
    if actor and requirement.organization_id != actor:
        raise AppError("FORBIDDEN_ORGANIZATION", "You cannot view another buyer's requirement.")
    return ok(requirement)


@router.patch("/requirements/{requirement_id}", response_model=ApiResponse[Requirement])
async def update_requirement(requirement_id: IdPath, body: RequirementUpdate, request: Request, c: ContainerDep):
    """Fulfilled and cancelled requirements are immutable."""
    actor = await require_actor(request, c.settings, body.caller_organization_id)
    return ok(await c.requirements.update(requirement_id, body, actor))

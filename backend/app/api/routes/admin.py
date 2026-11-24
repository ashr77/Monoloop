"""Super admin: review company applications (Member 4). Requires an admin account."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query, Request

from app.api.deps import ContainerDep
from app.core.security import require_admin
from app.schemas.auth import RejectRequest
from app.schemas.common import ApiResponse, ok
from app.schemas.entities import OrganizationRecord, OrganizationStatus

router = APIRouter(prefix="/api/admin", tags=["admin"])
IdPath = Annotated[str, Path(max_length=64)]


@router.get("/organizations", response_model=ApiResponse[list[OrganizationRecord]])
async def list_applications(request: Request, c: ContainerDep,
                            status: Annotated[OrganizationStatus | None, Query()] = None):
    """Company applications (companies with a login), newest first; filter by status."""
    await require_admin(request)
    rows = await c.auth.applications(status)
    return ok(rows, total=len(rows))


@router.post("/organizations/{organization_id}/approve", response_model=ApiResponse[OrganizationRecord])
async def approve(organization_id: IdPath, request: Request, c: ContainerDep):
    await require_admin(request)
    return ok(await c.auth.review(organization_id, "approve"))


@router.post("/organizations/{organization_id}/{decision}", response_model=ApiResponse[OrganizationRecord])
async def reject_or_suspend(organization_id: IdPath, decision: Literal["reject", "suspend"], body: RejectRequest,
                            request: Request, c: ContainerDep):
    """Reject an application or suspend an approved company, with a reason the company can see."""
    await require_admin(request)
    return ok(await c.auth.review(organization_id, decision, body.reason))

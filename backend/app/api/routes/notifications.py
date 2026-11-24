"""Notification bell: order and payment events on the acting organization's exchanges.

Acting organization: X-Organization-Id header (demo identity) or the JWT's organization.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import ContainerDep
from app.core.security import require_actor
from app.schemas.common import ApiResponse, ok
from app.schemas.notification import MarkNotificationsRead, Notification

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications", response_model=ApiResponse[list[Notification]])
async def list_notifications(request: Request, c: ContainerDep):
    """Newest first (latest 50). `meta.unread_total` is the number for the bell."""
    actor = await require_actor(request, c.settings)
    items, unread = await c.notifications.feed(actor)
    return ok(items, total=len(items), unread_total=unread)


@router.post("/notifications/read", response_model=ApiResponse[dict])
async def mark_notifications_read(body: MarkNotificationsRead, request: Request, c: ContainerDep):
    """Mark the given notifications (or `all`) as read for the acting organization."""
    actor = await require_actor(request, c.settings)
    unread = await c.notifications.mark_read(actor, body.ids, body.all)
    return ok({"unread_total": unread})

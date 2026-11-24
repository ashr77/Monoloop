"""Acting-organization resolution: the single gate every write goes through.

demo mode (AUTH_MODE=demo): the frontend's organization switcher sends X-Organization-Id. A demo
    identity, clearly not authentication; it still lets the server enforce ownership rules.
jwt mode (AUTH_MODE=jwt): a signed-in company. The bearer token is verified (Supabase ES256 keys,
    or the local provider in tests), the company comes from the token's app_metadata, and the
    company must be APPROVED by an admin. An X-Organization-Id header, if sent, must match.
    Admin accounts act for no company: they can review applications but not trade.
"""

from __future__ import annotations

from fastapi import Request

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.entities import is_uuid


def _auth(request: Request):
    return request.app.state.container.auth


async def resolve_actor(request: Request, settings: Settings, body_fallback: str | None = None) -> str | None:
    header = request.headers.get("x-organization-id") or None
    if settings.auth_mode == "jwt":
        auth = _auth(request)
        identity = await auth.identity(request)
        org = await auth.acting_organization(identity)  # raises ACCOUNT_PENDING unless approved
        if org is None:  # admin
            if header:
                raise AppError("FORBIDDEN_ORGANIZATION", "Admin accounts cannot act for a company.")
            return None
        if (header and header != org) or (body_fallback and body_fallback != org):
            raise AppError("FORBIDDEN_ORGANIZATION", "You can only act on behalf of your own company.")
        return org
    actor = header or body_fallback
    if actor is not None and not is_uuid(actor):
        raise AppError("VALIDATION_ERROR", "Acting organization id must be a UUID.")
    return actor


async def require_actor(request: Request, settings: Settings, body_fallback: str | None = None) -> str:
    actor = await resolve_actor(request, settings, body_fallback)
    if not actor:
        if settings.auth_mode == "jwt":
            raise AppError("FORBIDDEN_ROLE", "Admin accounts cannot trade; sign in as a company.")
        raise AppError("ACTOR_REQUIRED", "Acting organization is required (X-Organization-Id header).")
    return actor


async def require_admin(request: Request) -> None:
    auth = _auth(request)
    identity = await auth.identity(request)
    if identity.role != "admin":
        raise AppError("ADMIN_ONLY", "Only Meguri admins can do this.")


async def is_admin(request: Request, settings: Settings) -> bool:
    if settings.auth_mode != "jwt":
        return False
    try:
        return (await _auth(request).identity(request)).role == "admin"
    except AppError:
        return False

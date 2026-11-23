"""Acting-organization resolution.

demo mode (default): the frontend's organization switcher sends X-Organization-Id. This is a
    demo identity, clearly not authentication; it still lets the server enforce ownership rules.
jwt mode: a Supabase access token (Authorization: Bearer ...) is verified against the project's
    JWKS (signature, expiry, audience); the organization comes from app_metadata.organization_id.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache

import jwt
from fastapi import Request

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.entities import is_uuid


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


def _verify_token(token: str, settings: Settings) -> dict:
    if not settings.supabase_jwks_url:
        raise AppError("SERVICE_UNAVAILABLE", "JWT auth is enabled but SUPABASE_JWKS_URL is not configured.")
    try:
        key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience=settings.jwt_audience,
                          options={"require": ["exp", "sub"]})
    except jwt.PyJWTError as exc:
        raise AppError("UNAUTHORIZED", "Invalid or expired access token.") from exc


async def resolve_actor(request: Request, settings: Settings, body_fallback: str | None = None) -> str | None:
    header = request.headers.get("x-organization-id") or None
    if settings.auth_mode == "jwt":
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise AppError("UNAUTHORIZED", "Missing bearer token.")
        claims = await asyncio.to_thread(_verify_token, auth[7:].strip(), settings)
        org = (claims.get("app_metadata") or {}).get("organization_id")
        if not is_uuid(org):
            raise AppError("FORBIDDEN_ORGANIZATION", "Your account is not linked to an organization.")
        if header and header != org:
            raise AppError("FORBIDDEN_ORGANIZATION", "You can only act on behalf of your own organization.")
        return org
    actor = header or body_fallback
    if actor is not None and not is_uuid(actor):
        raise AppError("VALIDATION_ERROR", "Acting organization id must be a UUID.")
    return actor


async def require_actor(request: Request, settings: Settings, body_fallback: str | None = None) -> str:
    actor = await resolve_actor(request, settings, body_fallback)
    if not actor:
        raise AppError("ACTOR_REQUIRED", "Acting organization is required (X-Organization-Id header).")
    return actor

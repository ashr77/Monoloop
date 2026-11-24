"""Company accounts (Member 4): signup with licence number, login, session refresh, own profile.

Accounts are created server-side and pre-confirmed (no verification email). A new company is
PENDING until an admin approves it; until then every write answers 403 ACCOUNT_PENDING.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.api.deps import ContainerDep
from app.schemas.auth import LoginRequest, Profile, RefreshRequest, ResubmitRequest, Session, SignupRequest
from app.schemas.common import ApiResponse, ok

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[Session])
async def signup(body: SignupRequest, c: ContainerDep):
    """Register a company (one account = one company). It starts as PENDING admin approval."""
    return ok(await c.auth.signup(body))


@router.post("/login", response_model=ApiResponse[Session])
async def login(body: LoginRequest, c: ContainerDep):
    return ok(await c.auth.login(body.email, body.password))


@router.post("/refresh", response_model=ApiResponse[Session])
async def refresh(body: RefreshRequest, c: ContainerDep):
    return ok(await c.auth.refresh(body.refresh_token))


@router.get("/me", response_model=ApiResponse[Profile])
async def me(request: Request, c: ContainerDep):
    """The signed-in account and its company (with status, licence and any rejection reason)."""
    return ok(await c.auth.profile(await c.auth.identity(request)))


@router.patch("/application", response_model=ApiResponse[Profile])
async def resubmit(body: ResubmitRequest, request: Request, c: ContainerDep):
    """A rejected company corrects its details and goes back to PENDING."""
    return ok(await c.auth.resubmit(await c.auth.identity(request), body))

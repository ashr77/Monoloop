"""Company accounts and admin approval.

One login = one company (organization_type HYBRID: it can both supply and buy).
Signup creates the login with the company id in app_metadata, then the company row as PENDING.
Approval is a status in the database, checked on every write, so it takes effect immediately
without new tokens.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import Request

from app.core.errors import AppError
from app.repositories.base import Repositories
from app.schemas.auth import (
    PasswordChange,
    Profile,
    ProfileUpdate,
    ProfileUpdateResult,
    ResubmitRequest,
    Session,
    SignupRequest,
)
from app.schemas.entities import OrganizationRecord
from app.services.auth.provider import AuthProvider, Identity

_STATUS_MESSAGE = {
    "PENDING": "Your company is waiting for admin approval.",
    "REJECTED": "Your application was rejected. Update it and submit again.",
    "SUSPENDED": "Your company account is suspended. Contact the MONOLOOP admin.",
}


class AuthService:
    def __init__(self, repos: Repositories, provider: AuthProvider):
        self.repos = repos
        self.provider = provider

    # -- sessions --------------------------------------------------------------------------

    async def identity(self, request: Request) -> Identity:
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer ") or len(auth) < 20:
            raise AppError("UNAUTHORIZED", "Please sign in.")
        return await self.provider.verify(auth[7:].strip())

    async def profile(self, identity: Identity) -> Profile:
        if identity.role == "admin":
            return Profile(email=identity.email, role="admin")
        org = await self.repos.organizations.get_record(identity.organization_id or "")
        if org is None:
            raise AppError("FORBIDDEN_ORGANIZATION", "Your account is not linked to a company.")
        return Profile(email=identity.email, role="company", organization=org)

    async def _session(self, email: str, password: str) -> Session:
        tokens = await self.provider.sign_in(email, password)
        identity = await self.provider.verify(tokens.access_token)
        return Session(access_token=tokens.access_token, refresh_token=tokens.refresh_token,
                       expires_at=tokens.expires_at, profile=await self.profile(identity))

    async def login(self, email: str, password: str) -> Session:
        return await self._session(email, password)

    async def refresh(self, refresh_token: str) -> Session:
        tokens = await self.provider.refresh(refresh_token)
        identity = await self.provider.verify(tokens.access_token)
        return Session(access_token=tokens.access_token, refresh_token=tokens.refresh_token,
                       expires_at=tokens.expires_at, profile=await self.profile(identity))

    async def signup(self, req: SignupRequest) -> Session:
        conflict = await self.repos.organizations.find_conflict(req.email, req.license_number)
        if conflict == "email":
            raise AppError("EMAIL_TAKEN", "An account with this email already exists.")
        if conflict == "license":
            raise AppError("LICENSE_TAKEN", "A company with this licence number is already registered.")

        org_id = str(uuid.uuid4())
        user_id = await self.provider.create_user(req.email, req.password,
                                                  {"organization_id": org_id, "role": "company"})
        try:
            await self.repos.organizations.create({
                "id": org_id, "name": req.company_name, "organization_type": "HYBRID", "city": req.city,
                "address": req.address, "status": "PENDING", "license_number": req.license_number,
                "contact_email": req.email, "auth_user_id": user_id,
            })
        except Exception:
            await self.provider.delete_user(user_id)  # no login without its company
            raise
        return await self._session(req.email, req.password)

    async def resubmit(self, identity: Identity, req: ResubmitRequest) -> Profile:
        org = await self._own(identity)
        if org.status != "REJECTED":
            raise AppError("INVALID_STATE", "Only a rejected application can be submitted again.")
        changes = {k: v for k, v in req.model_dump().items() if v is not None}
        if "license_number" in changes and changes["license_number"].lower() != (org.license_number or "").lower():
            if await self.repos.organizations.find_conflict("-", changes["license_number"]) == "license":
                raise AppError("LICENSE_TAKEN", "A company with this licence number is already registered.")
        if "company_name" in changes:
            changes["name"] = changes.pop("company_name")
        await self.repos.organizations.update(org.id, {**changes, "status": "PENDING", "rejection_reason": None})
        return await self.profile(identity)

    async def update_profile(self, identity: Identity, req: ProfileUpdate) -> ProfileUpdateResult:
        """Address/city apply immediately. A new company name or licence number sends the company
        back to PENDING: otherwise an approved account could turn into a different company."""
        org = await self._own(identity)
        changes: dict = {}
        if req.company_name is not None and req.company_name != org.name:
            changes["name"] = req.company_name
        if req.license_number is not None and req.license_number.lower() != (org.license_number or "").lower():
            if await self.repos.organizations.find_conflict("-", req.license_number) == "license":
                raise AppError("LICENSE_TAKEN", "A company with this licence number is already registered.")
            changes["license_number"] = req.license_number
        if req.city is not None and req.city != org.city:
            changes["city"] = req.city
        if req.address is not None and (req.address or None) != org.address:
            changes["address"] = req.address or None
        reapproval = bool({"name", "license_number"} & changes.keys()) and org.status != "SUSPENDED"
        if reapproval:
            changes |= {"status": "PENDING", "rejection_reason": None, "reviewed_at": None}
        if changes:
            await self.repos.organizations.update(org.id, changes)
        return ProfileUpdateResult(profile=await self.profile(identity), reapproval_required=reapproval)

    async def change_password(self, identity: Identity, req: PasswordChange) -> None:
        try:
            await self.provider.sign_in(identity.email, req.current_password)
        except AppError as exc:
            if exc.code == "INVALID_CREDENTIALS":
                raise AppError("WRONG_PASSWORD", "Your current password is incorrect.") from exc
            raise
        if req.new_password == req.current_password:
            raise AppError("VALIDATION_ERROR", "Choose a password different from the current one.")
        await self.provider.set_password(identity.user_id, req.new_password)

    async def _own(self, identity: Identity) -> OrganizationRecord:
        org = await self.repos.organizations.get_record(identity.organization_id or "")
        if org is None:
            raise AppError("FORBIDDEN_ORGANIZATION", "Your account is not linked to a company.")
        return org

    # -- authorization used by every write (core.security) ----------------------------------

    async def acting_organization(self, identity: Identity) -> str | None:
        """The company this user acts for; None for admins. Raises unless the company is APPROVED."""
        if identity.role == "admin":
            return None
        org = await self._own(identity)
        if org.status != "APPROVED":
            raise AppError("ACCOUNT_PENDING", _STATUS_MESSAGE.get(org.status, "Account not active."),
                           {"status": org.status})
        return org.id

    # -- admin --------------------------------------------------------------------------------

    async def applications(self, status: str | None) -> list[OrganizationRecord]:
        # Only companies with a login are applications; seeded demo organizations have none.
        return [o for o in await self.repos.organizations.list_records(status) if o.auth_user_id]

    async def review(self, organization_id: str, decision: str, reason: str | None = None) -> OrganizationRecord:
        org = await self.repos.organizations.get_record(organization_id)
        if org is None or not org.auth_user_id:
            raise AppError("NOT_FOUND", "Application not found.")
        changes: dict = {"reviewed_at": datetime.now(UTC)}
        if decision == "approve":
            changes |= {"status": "APPROVED", "rejection_reason": None}
        elif decision == "reject":
            changes |= {"status": "REJECTED", "rejection_reason": reason}
        elif decision == "suspend":
            changes |= {"status": "SUSPENDED", "rejection_reason": reason}
        updated = await self.repos.organizations.update(organization_id, changes)
        assert updated is not None
        return updated

    async def ensure_demo_accounts(self, password: str, domain: str = "monoloop.demo") -> list[tuple[str, str]]:
        """Give every existing company without a login one: <first word of name>@<domain>, APPROVED and
        HYBRID (with a login a company both supplies and buys).
        Idempotent: companies that already have a login are skipped. Returns (company, email)."""
        created: list[tuple[str, str]] = []
        used: set[str] = set()
        for org in sorted(await self.repos.organizations.list_records(), key=lambda o: o.id):
            if org.auth_user_id:
                continue
            slug = "".join(ch for ch in org.name.split()[0].lower() if ch.isalnum()) or "company"
            local, n = slug, 2
            while local in used:
                local, n = f"{slug}{n}", n + 1
            used.add(local)
            email = f"{local}@{domain}"
            try:
                user_id = await self.provider.create_user(email, password,
                                                          {"organization_id": org.id, "role": "company"})
            except AppError as exc:
                if exc.code == "EMAIL_TAKEN":
                    continue  # created earlier but not linked: leave it for a manual fix
                raise
            await self.repos.organizations.update(org.id, {
                # One account = one company that can both supply and buy.
                "organization_type": "HYBRID",
                "contact_email": email, "auth_user_id": user_id, "status": "APPROVED",
                "license_number": org.license_number or f"DEMO-{org.id[:8].upper()}",
            })
            created.append((org.name, email))
        return created

    async def create_admin(self, email: str, password: str) -> str:
        return await self.provider.create_user(email.lower(), password, {"role": "admin"})

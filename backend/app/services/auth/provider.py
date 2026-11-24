"""Login providers (Strategy pattern).

SupabaseAuthProvider: real accounts in Supabase Auth. Accounts are created server-side with the
    service-role key (email pre-confirmed, so no verification email is needed) and tokens are
    verified offline against the project's published ES256 keys (JWKS).
LocalAuthProvider: in-process accounts and HS256 tokens for tests and offline demo runs.

Both put the company and role into app_metadata, which only the server can write.
"""

from __future__ import annotations

import asyncio
import secrets
import time
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import httpx
import jwt

from app.core.errors import AppError


@dataclass(frozen=True, slots=True)
class Tokens:
    access_token: str
    refresh_token: str
    expires_at: int  # unix seconds


@dataclass(frozen=True, slots=True)
class Identity:
    user_id: str
    email: str
    role: str  # "admin" | "company"
    organization_id: str | None


def identity_from_claims(claims: dict) -> Identity:
    meta = claims.get("app_metadata") or {}
    role = "admin" if meta.get("role") == "admin" else "company"
    return Identity(user_id=str(claims.get("sub") or ""), email=str(claims.get("email") or ""),
                    role=role, organization_id=meta.get("organization_id"))


class AuthProvider(Protocol):
    name: str

    async def create_user(self, email: str, password: str, app_metadata: dict) -> str: ...
    async def delete_user(self, user_id: str) -> None: ...
    async def sign_in(self, email: str, password: str) -> Tokens: ...
    async def refresh(self, refresh_token: str) -> Tokens: ...
    async def verify(self, access_token: str) -> Identity: ...


# ---------------------------------------------------------------------------- Supabase


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


class SupabaseAuthProvider:
    name = "supabase"

    def __init__(self, http: httpx.AsyncClient, url: str, service_role_key: str, jwks_url: str = "",
                 audience: str = "authenticated"):
        self.http = http
        self.base = url.rstrip("/") + "/auth/v1"
        self.key = service_role_key
        self.jwks_url = jwks_url or f"{self.base}/.well-known/jwks.json"
        self.audience = audience

    def _headers(self) -> dict[str, str]:
        return {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}

    async def _post(self, path: str, body: dict, *, admin: bool = False) -> httpx.Response:
        headers = self._headers() if admin else {"apikey": self.key, "Content-Type": "application/json"}
        try:
            return await self.http.post(self.base + path, json=body, headers=headers, timeout=15)
        except httpx.HTTPError as exc:
            raise AppError("SERVICE_UNAVAILABLE", f"Login service is unreachable ({type(exc).__name__}).") from exc

    async def create_user(self, email: str, password: str, app_metadata: dict) -> str:
        r = await self._post("/admin/users", {"email": email, "password": password, "email_confirm": True,
                                              "app_metadata": app_metadata}, admin=True)
        if r.status_code in (200, 201):
            return str(r.json()["id"])
        text = r.text.lower()
        if r.status_code == 422 and ("already" in text or "exists" in text):
            raise AppError("EMAIL_TAKEN", "An account with this email already exists.")
        if r.status_code == 422 and "password" in text:
            raise AppError("VALIDATION_ERROR", "Password is too weak for the login service.")
        raise AppError("SERVICE_UNAVAILABLE", f"Could not create the account (login service HTTP {r.status_code}).")

    async def delete_user(self, user_id: str) -> None:
        try:
            await self.http.delete(f"{self.base}/admin/users/{user_id}", headers=self._headers(), timeout=15)
        except httpx.HTTPError:
            pass  # best effort cleanup

    def _tokens(self, r: httpx.Response) -> Tokens:
        if r.status_code == 200:
            d = r.json()
            return Tokens(d["access_token"], d["refresh_token"], int(d.get("expires_at") or time.time() + 3600))
        if r.status_code in (400, 401):
            raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect.")
        raise AppError("SERVICE_UNAVAILABLE", f"Login service error (HTTP {r.status_code}).")

    async def sign_in(self, email: str, password: str) -> Tokens:
        return self._tokens(await self._post("/token?grant_type=password", {"email": email, "password": password}))

    async def refresh(self, refresh_token: str) -> Tokens:
        r = await self._post("/token?grant_type=refresh_token", {"refresh_token": refresh_token})
        if r.status_code in (400, 401):
            raise AppError("UNAUTHORIZED", "Session expired. Please sign in again.")
        return self._tokens(r)

    async def verify(self, access_token: str) -> Identity:
        def _decode() -> dict:
            key = _jwks_client(self.jwks_url).get_signing_key_from_jwt(access_token)
            return jwt.decode(access_token, key.key, algorithms=["ES256", "RS256"], audience=self.audience,
                              options={"require": ["exp", "sub"]})
        try:
            claims = await asyncio.to_thread(_decode)
        except jwt.PyJWTError as exc:
            raise AppError("UNAUTHORIZED", "Invalid or expired session. Please sign in again.") from exc
        return identity_from_claims(claims)

    async def set_app_metadata(self, user_id: str, app_metadata: dict) -> None:
        r = await self.http.put(f"{self.base}/admin/users/{user_id}", json={"app_metadata": app_metadata},
                                headers=self._headers(), timeout=15)
        r.raise_for_status()


# ---------------------------------------------------------------------------- Local


class LocalAuthProvider:
    """Accounts in memory, HS256 tokens. For tests and DATA_BACKEND=memory demos only."""

    name = "local"

    def __init__(self, secret: str | None = None, ttl_seconds: int = 3600):
        self.secret = secret or secrets.token_urlsafe(32)
        self.ttl = ttl_seconds
        self.users: dict[str, dict] = {}  # email(lower) -> {id, email, password_hash, app_metadata}
        self.refresh_tokens: dict[str, str] = {}  # token -> email(lower)

    @staticmethod
    def _hash(password: str, salt: str) -> str:
        import hashlib
        return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()

    async def create_user(self, email: str, password: str, app_metadata: dict) -> str:
        key = email.lower()
        if key in self.users:
            raise AppError("EMAIL_TAKEN", "An account with this email already exists.")
        salt = secrets.token_hex(8)
        uid = str(uuid.uuid4())
        self.users[key] = {"id": uid, "email": email, "salt": salt, "hash": self._hash(password, salt),
                           "app_metadata": dict(app_metadata)}
        return uid

    async def delete_user(self, user_id: str) -> None:
        for k, u in list(self.users.items()):
            if u["id"] == user_id:
                del self.users[k]

    def _issue(self, user: dict) -> Tokens:
        exp = int(time.time()) + self.ttl
        token = jwt.encode({"sub": user["id"], "email": user["email"], "aud": "authenticated", "exp": exp,
                            "app_metadata": user["app_metadata"]}, self.secret, algorithm="HS256")
        refresh = secrets.token_urlsafe(32)
        self.refresh_tokens[refresh] = user["email"].lower()
        return Tokens(token, refresh, exp)

    async def sign_in(self, email: str, password: str) -> Tokens:
        user = self.users.get(email.lower())
        if not user or not secrets.compare_digest(user["hash"], self._hash(password, user["salt"])):
            raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect.")
        return self._issue(user)

    async def refresh(self, refresh_token: str) -> Tokens:
        email = self.refresh_tokens.pop(refresh_token, None)  # rotate: each refresh token works once
        if not email or email not in self.users:
            raise AppError("UNAUTHORIZED", "Session expired. Please sign in again.")
        return self._issue(self.users[email])

    async def verify(self, access_token: str) -> Identity:
        try:
            claims = jwt.decode(access_token, self.secret, algorithms=["HS256"], audience="authenticated",
                                options={"require": ["exp", "sub"]})
        except jwt.PyJWTError as exc:
            raise AppError("UNAUTHORIZED", "Invalid or expired session. Please sign in again.") from exc
        return identity_from_claims(claims)

    async def set_app_metadata(self, user_id: str, app_metadata: dict) -> None:
        for u in self.users.values():
            if u["id"] == user_id:
                u["app_metadata"] = dict(app_metadata)

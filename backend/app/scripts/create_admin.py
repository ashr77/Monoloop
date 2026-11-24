"""Create the MONOLOOP super admin login (one-off).

    ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='…' .venv/bin/python -m app.scripts.create_admin

Uses backend/.env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). The account is created pre-confirmed
with app_metadata.role = "admin", which only the service-role key can set. The password is read
from the environment and never stored or printed.
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx

from app.core.config import Settings
from app.services.auth.provider import SupabaseAuthProvider


async def main() -> int:
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not email or len(password) < 8:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters).", file=sys.stderr)
        return 2
    settings = Settings()
    if not settings.supabase_rest_configured:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in backend/.env.", file=sys.stderr)
        return 2
    async with httpx.AsyncClient() as http:
        provider = SupabaseAuthProvider(http, settings.supabase_url, settings.supabase_service_role_key)
        user_id = await provider.create_user(email, password, {"role": "admin"})
        identity = await provider.verify((await provider.sign_in(email, password)).access_token)
    print(f"Admin created: {email} (user {user_id[:8]}…, role={identity.role})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

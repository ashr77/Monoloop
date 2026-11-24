"""Give every existing company in Supabase a login (one-off, after migration 00009).

    DEMO_PASSWORD='…' .venv/bin/python -m app.scripts.create_demo_accounts

Each company without a login gets <first word of its name>@monoloop.demo, pre-confirmed and
APPROVED. Companies that already have a login are skipped, so it is safe to run again.
"""

from __future__ import annotations

import asyncio
import os
import sys

from app.api.deps import build_container
from app.core.config import Settings


async def main() -> int:
    password = os.environ.get("DEMO_PASSWORD", "")
    if len(password) < 8:
        print("Set DEMO_PASSWORD (8+ characters).", file=sys.stderr)
        return 2
    settings = Settings()
    if not settings.supabase_rest_configured:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in backend/.env.", file=sys.stderr)
        return 2
    container = build_container(settings)
    try:
        created = await container.auth.ensure_demo_accounts(password)
    finally:
        await container.aclose()
    for name, email in created:
        print(f"{email:32} {name}")
    print(f"{len(created)} login(s) created.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

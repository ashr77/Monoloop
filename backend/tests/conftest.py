from __future__ import annotations

import httpx
import pytest

from app.api.deps import build_container
from app.core.config import Settings
from app.main import create_app

# Seed ids (app/seed/seed_data.json)
SUP_GAZIPUR = "a1111111-1111-4111-a111-111111111111"  # Gazipur Metal Works
SUP_DHAKA = "a2222222-2222-4222-a222-222222222222"  # Dhaka Precision Steel
SUP_NARAYANGANJ = "a3333333-3333-4333-a333-333333333333"
BUYER_APEX = "b1111111-1111-4111-b111-111111111111"  # Dhaka buyer
BUYER_DELTA = "b2222222-2222-4222-b222-222222222222"
SEED_REQ = "d1111111-1111-4111-d111-111111111111"  # 80 × SS304 2400×1200×2 → 50 + 30 from two suppliers
REQ_PLY = "e1111111-1111-4111-e111-111111111111"
REQ_NO_STOCK = "d2222222-2222-4222-d222-222222222222"
REQ_OVER_BUDGET = "d3333333-3333-4333-d333-333333333333"


def make_settings(**overrides) -> Settings:
    base = dict(environment="test", data_backend="memory", database_url="", ai_api_key="",
                rate_limit_per_minute=10_000, rate_limit_writes_per_minute=10_000)
    return Settings(_env_file=None, **{**base, **overrides})


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
async def app(settings):
    application = create_app(settings)
    container = build_container(settings)
    application.state.container = container
    yield application
    await container.aclose()


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def store(app):
    return app.state.container.store


def as_org(org_id: str) -> dict[str, str]:
    return {"X-Organization-Id": org_id}

"""Listing photo uploads: validation, local storage and the Supabase Storage adapter."""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from app.api.deps import build_container
from app.main import create_app
from app.services.storage import SupabaseImageStorage
from tests.conftest import SUP_GAZIPUR, as_org, make_settings

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
async def upload_client(tmp_path):
    settings = make_settings(upload_dir=str(tmp_path), public_api_url="http://api.test")
    app = create_app(settings)
    app.state.container = build_container(settings)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c, tmp_path
    await app.state.container.aclose()


async def test_upload_saves_locally_and_serves_file(upload_client):
    client, root = upload_client
    r = await client.post("/api/uploads/listing-image", json={"image_base64": b64(PNG), "mime_type": "image/png"},
                          headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    assert data["mime_type"] == "image/png" and data["size_bytes"] == len(PNG)
    assert data["path"].startswith(f"{SUP_GAZIPUR}/") and data["path"].endswith(".png")
    assert data["url"] == f"http://api.test/uploads/{data['path']}"
    assert (root / data["path"]).read_bytes() == PNG
    served = await client.get(f"/uploads/{data['path']}")
    assert served.status_code == 200 and served.content == PNG

    # The returned URL is accepted as image_url by the listing endpoints, unchanged.
    listing = await client.get("/api/listings", params={"organization_id": SUP_GAZIPUR})
    lid = listing.json()["data"][0]["id"]
    patch = await client.patch(f"/api/listings/{lid}", json={"image_url": data["url"]}, headers=as_org(SUP_GAZIPUR))
    assert patch.status_code == 200 and patch.json()["data"]["image_url"] == data["url"]


async def test_upload_requires_acting_organization(upload_client):
    client, _ = upload_client
    r = await client.post("/api/uploads/listing-image", json={"image_base64": b64(PNG), "mime_type": "image/png"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ACTOR_REQUIRED"
    r = await client.post("/api/uploads/listing-image", json={"image_base64": b64(PNG), "mime_type": "image/png"},
                          headers=as_org("f0000000-0000-4000-a000-000000000000"))
    assert r.status_code == 404


@pytest.mark.parametrize(("payload", "code"), [
    ({"image_base64": b64(b"GIF89a" + b"\x00" * 64), "mime_type": "image/png"}, "VALIDATION_ERROR"),  # not an image we accept
    ({"image_base64": b64(JPEG), "mime_type": "image/png"}, "VALIDATION_ERROR"),  # declared type does not match
    ({"image_base64": "!!!not-base64!!!==", "mime_type": "image/png"}, "VALIDATION_ERROR"),
    ({"image_base64": b64(PNG), "mime_type": "image/gif"}, "VALIDATION_ERROR"),
    ({"image_base64": b64(PNG), "mime_type": "image/png", "extra": 1}, "VALIDATION_ERROR"),
])
async def test_upload_rejects_bad_files(upload_client, payload, code):
    client, root = upload_client
    r = await client.post("/api/uploads/listing-image", json=payload, headers=as_org(SUP_GAZIPUR))
    assert r.status_code == 400 and r.json()["error"]["code"] == code
    assert not any(root.rglob("*.*"))


async def test_upload_too_large_is_413(tmp_path):
    settings = make_settings(upload_dir=str(tmp_path), max_image_bytes=10_000)
    app = create_app(settings)
    app.state.container = build_container(settings)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        big = PNG + b"\x00" * 20_000
        r = await client.post("/api/uploads/listing-image", json={"image_base64": b64(big), "mime_type": "image/png"},
                              headers=as_org(SUP_GAZIPUR))
        assert r.status_code == 413
    await app.state.container.aclose()


async def test_supabase_storage_creates_bucket_on_first_upload():
    calls: list[tuple[str, str, dict]] = []
    bucket_exists = {"value": False}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, dict(request.headers)))
        if request.url.path == "/storage/v1/bucket":
            body = json.loads(request.content)
            assert body["id"] == "listing-images" and body["public"] is True
            bucket_exists["value"] = True
            return httpx.Response(200, json={"name": "listing-images"})
        if not bucket_exists["value"]:
            return httpx.Response(400, json={"statusCode": "404", "error": "Bucket not found", "message": "Bucket not found"})
        assert request.headers["content-type"] == "image/png" and request.content == PNG
        return httpx.Response(200, json={"Key": "listing-images/org/x.png"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        store = SupabaseImageStorage(http, "https://proj.supabase.co", "service-key", "listing-images", 5_000_000)
        url = await store.save("org/x.png", PNG, "image/png")
        assert url == "https://proj.supabase.co/storage/v1/object/public/listing-images/org/x.png"
        assert [c[1] for c in calls] == ["/storage/v1/object/listing-images/org/x.png", "/storage/v1/bucket",
                                         "/storage/v1/object/listing-images/org/x.png"]
        assert calls[0][2]["authorization"] == "Bearer service-key"

        # The second upload goes straight through.
        await store.save("org/y.png", PNG, "image/png")
        assert len(calls) == 4

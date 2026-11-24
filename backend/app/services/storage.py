"""Listing photo storage (Member 1).

Suppliers can upload a photo instead of pasting a link. The file is stored and its public URL goes
into `image_url` exactly as a pasted link would, so listings, matching and exchanges are unchanged.

    SupabaseImageStorage   public bucket in the project's Supabase Storage (created on first upload)
    LocalImageStorage      backend/uploads/, served at /uploads (offline demo; not persistent on Render)
"""

from __future__ import annotations

import base64
import binascii
import logging
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

import httpx
from pydantic import BaseModel

from app.core.config import Settings
from app.core.errors import AppError

logger = logging.getLogger("monoloop.storage")

IMAGE_MIME_TYPES: dict[str, str] = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
LOCAL_UPLOAD_ROUTE = "/uploads"


class UploadedImage(BaseModel):
    url: str
    path: str
    size_bytes: int
    mime_type: str


def sniff_image_type(data: bytes) -> str | None:
    """Trust the file's magic bytes, not the declared type."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class ImageStore(Protocol):
    name: str

    async def save(self, path: str, data: bytes, mime_type: str) -> str: ...


class SupabaseImageStorage:
    name = "supabase"

    def __init__(self, http: httpx.AsyncClient, supabase_url: str, service_key: str, bucket: str, max_bytes: int):
        self.http = http
        self.base = f"{supabase_url.rstrip('/')}/storage/v1"
        self.bucket = bucket
        self.max_bytes = max_bytes
        self.headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
        self._bucket_ready = False

    async def _ensure_bucket(self) -> None:
        body = {"id": self.bucket, "name": self.bucket, "public": True,
                "file_size_limit": self.max_bytes, "allowed_mime_types": list(IMAGE_MIME_TYPES)}
        r = await self.http.post(f"{self.base}/bucket", json=body, headers=self.headers, timeout=15)
        if r.status_code >= 400 and "already exists" not in r.text.lower():
            logger.warning("Could not create storage bucket %s: %s %s", self.bucket, r.status_code, r.text[:200])
            raise AppError("SERVICE_UNAVAILABLE", "Photo storage is not available right now.")
        self._bucket_ready = True

    async def _upload(self, path: str, data: bytes, mime_type: str) -> httpx.Response:
        headers = {**self.headers, "Content-Type": mime_type, "x-upsert": "false",
                   "cache-control": "max-age=31536000"}
        return await self.http.post(f"{self.base}/object/{self.bucket}/{path}", content=data,
                                    headers=headers, timeout=30)

    async def save(self, path: str, data: bytes, mime_type: str) -> str:
        try:
            r = await self._upload(path, data, mime_type)
            if r.status_code >= 400 and not self._bucket_ready and "not found" in r.text.lower():
                await self._ensure_bucket()
                r = await self._upload(path, data, mime_type)
        except httpx.HTTPError as exc:
            logger.warning("Storage upload failed: %s", exc)
            raise AppError("SERVICE_UNAVAILABLE", "Photo storage is not reachable right now.") from exc
        if r.status_code >= 400:
            logger.warning("Storage upload rejected: %s %s", r.status_code, r.text[:200])
            raise AppError("SERVICE_UNAVAILABLE", "The photo could not be stored. Try again or paste a link.")
        self._bucket_ready = True
        return f"{self.base}/object/public/{self.bucket}/{path}"


class LocalImageStorage:
    name = "local"

    def __init__(self, root: Path, public_base_url: str):
        self.root = root
        self.public_base_url = public_base_url.rstrip("/")

    async def save(self, path: str, data: bytes, mime_type: str) -> str:
        target = (self.root / path).resolve()
        if self.root.resolve() not in target.parents:
            raise AppError("VALIDATION_ERROR", "Invalid file path.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return f"{self.public_base_url}{LOCAL_UPLOAD_ROUTE}/{path}"


class ImageUploadService:
    def __init__(self, store: ImageStore, max_bytes: int):
        self.store = store
        self.max_bytes = max_bytes

    async def upload_listing_image(self, image_base64: str, declared_mime: str, organization_id: str) -> UploadedImage:
        try:
            data = base64.b64decode(image_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise AppError("VALIDATION_ERROR", "The photo data is not valid base64.") from exc
        if not data:
            raise AppError("VALIDATION_ERROR", "The photo is empty.")
        if len(data) > self.max_bytes:
            raise AppError("PAYLOAD_TOO_LARGE", f"Photos must be {self.max_bytes // 1_000_000} MB or smaller.")
        mime = sniff_image_type(data)
        if mime is None or mime != declared_mime:
            raise AppError("VALIDATION_ERROR", "Only JPEG, PNG or WebP photos are accepted.")
        stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        path = f"{organization_id}/{stamp}-{secrets.token_hex(8)}.{IMAGE_MIME_TYPES[mime]}"
        url = await self.store.save(path, data, mime)
        return UploadedImage(url=url, path=path, size_bytes=len(data), mime_type=mime)


def build_image_store(settings: Settings, http: httpx.AsyncClient, data_backend: str) -> ImageStore:
    """Supabase Storage whenever the project is configured (and not on demo data); local disk otherwise."""
    if settings.supabase_rest_configured and data_backend != "memory":
        return SupabaseImageStorage(http, settings.supabase_url, settings.supabase_service_role_key,
                                    settings.storage_bucket, settings.max_image_bytes)
    return LocalImageStorage(Path(settings.upload_dir), settings.public_api_url)

"""Pure-ASGI middleware (cheaper than BaseHTTPMiddleware: no extra task or body buffering).

    RequestContextMiddleware  X-Request-ID, Server-Timing, one structured access-log line
    SecurityHeadersMiddleware nosniff, frame denial, strict CSP for JSON, no-store caching
    BodySizeLimitMiddleware   413 for bodies over MAX_BODY_BYTES (declared or streamed)
    RateLimitMiddleware       per-client sliding window, stricter for writes, 429 + Retry-After
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from collections import deque
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_body

access_log = logging.getLogger("monoloop.access")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


async def _send_json(send: Send, status: int, body: dict[str, Any], headers: list[tuple[bytes, bytes]] | None = None):
    payload = json.dumps(body).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode()),
                    *(headers or [])],
    })
    await send({"type": "http.response.body", "body": payload})


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        incoming = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _REQUEST_ID.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        start = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                ms = (time.perf_counter() - start) * 1000
                message.setdefault("headers", [])
                message["headers"] += [
                    (b"x-request-id", request_id.encode()),
                    (b"server-timing", f"app;dur={ms:.1f}".encode()),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            access_log.info(
                "%s %s %s %.1fms rid=%s", scope["method"], scope["path"], status_holder["status"],
                (time.perf_counter() - start) * 1000, request_id,
            )


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, hsts: bool = False):
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        is_docs = scope["path"].startswith(_DOCS_PATHS)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers += [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"cross-origin-resource-policy", b"same-site"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                ]
                if not is_docs:
                    # JSON API: nothing may execute or be framed, and responses are never cached.
                    headers += [
                        (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
                        (b"cache-control", b"no-store"),
                    ]
                if self.hsts:
                    headers.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains"))
            await send(message)

        await self.app(scope, receive, send_wrapper)


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int, path_limits: dict[str, int] | None = None):
        self.app = app
        self.max_bytes = max_bytes
        # Exact-path overrides, e.g. the voice upload route takes a larger body than JSON forms.
        self.path_limits = path_limits or {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        max_bytes = self.path_limits.get(scope.get("path", ""), self.max_bytes)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared and declared.isdigit() and int(declared) > max_bytes:
            return await _send_json(send, 413, error_body("PAYLOAD_TOO_LARGE", "Request body is too large."))

        # Streamed (chunked) bodies: stop reading past the limit and replace whatever response the
        # app produces for the truncated body with a 413.
        state = {"received": 0, "too_large": False, "sent": False}

        async def limited_receive() -> Message:
            if state["too_large"]:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                state["received"] += len(message.get("body", b""))
                if state["received"] > max_bytes:
                    state["too_large"] = True
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            if not state["too_large"]:
                return await send(message)
            if not state["sent"]:
                state["sent"] = True
                await _send_json(send, 413, error_body("PAYLOAD_TOO_LARGE", "Request body is too large."))

        await self.app(scope, limited_receive, guarded_send)


class RateLimitMiddleware:
    """Sliding-window limiter keyed by client address. In-process: for several workers or
    instances put the same limits on the reverse proxy / API gateway (or back this with Redis)."""

    WINDOW = 60.0

    def __init__(self, app: ASGIApp, reads_per_minute: int, writes_per_minute: int):
        self.app = app
        self.limits = {"read": reads_per_minute, "write": writes_per_minute}
        self.hits: dict[tuple[str, str], deque[float]] = {}
        self._last_sweep = time.monotonic()

    def _sweep(self, now: float) -> None:
        if now - self._last_sweep < self.WINDOW:
            return
        self._last_sweep = now
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] > self.WINDOW]:
            del self.hits[key]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] == "OPTIONS" or scope["path"] in ("/health", "/api/health"):
            return await self.app(scope, receive, send)
        kind = "read" if scope["method"] in ("GET", "HEAD") else "write"
        client = (scope.get("client") or ("unknown", 0))[0]
        now = time.monotonic()
        self._sweep(now)
        q = self.hits.setdefault((client, kind), deque())
        while q and now - q[0] > self.WINDOW:
            q.popleft()
        if len(q) >= self.limits[kind]:
            retry = max(1, int(self.WINDOW - (now - q[0])) + 1)
            return await _send_json(
                send, 429, error_body("RATE_LIMITED", "Too many requests. Please slow down."),
                [(b"retry-after", str(retry).encode())],
            )
        q.append(now)
        await self.app(scope, receive, send)

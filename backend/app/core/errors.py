"""Typed application errors and the handlers that turn them into the ApiResponse envelope.

Every error leaves the API in the same shape the frontend already understands:
    {"success": false, "error": {"code": "...", "message": "...", "details": ...}}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("monoloop.errors")

# Single source of truth: error code -> HTTP status.
ERROR_STATUS: dict[str, int] = {
    "VALIDATION_ERROR": 400,
    "ACTOR_REQUIRED": 400,
    "FORBIDDEN_FIELD": 400,
    "INVALID_QUANTITY": 400,
    "UNAUTHORIZED": 401,
    "FORBIDDEN_ROLE": 403,
    "FORBIDDEN_ORGANIZATION": 403,
    "NOT_FOUND": 404,
    "METHOD_NOT_ALLOWED": 405,
    "IMMUTABLE_STATUS": 409,
    "INVALID_STATE": 409,
    "INSUFFICIENT_STOCK": 409,
    "LISTING_UNAVAILABLE": 409,
    "DUPLICATE_EXCHANGE": 409,
    "REQUIREMENT_NOT_OPEN": 409,
    "PAYLOAD_TOO_LARGE": 413,
    "NO_ALLOCATION": 422,
    "RATE_LIMITED": 429,
    "INTERNAL_ERROR": 500,
    "SERVICE_UNAVAILABLE": 503,
}


class AppError(Exception):
    """Domain/application error with a stable machine-readable code."""

    def __init__(self, code: str, message: str, details: Any = None, status: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.status = status or ERROR_STATUS.get(code, 500)


def not_found(what: str) -> AppError:
    return AppError("NOT_FOUND", f"{what} was not found.")


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"success": False, "error": error}


def _json(status: int, body: dict[str, Any], headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content=jsonable_encoder(body), headers=headers)


def _validation_details(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Compact, non-echoing validation details (field path + message, never the raw input)."""
    out = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path", "header")]
        out.append({"field": ".".join(loc) or None, "message": err.get("msg", "Invalid value")})
    return out


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _json(exc.status, error_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _json(400, error_body("VALIDATION_ERROR", "Invalid request.", _validation_details(exc)))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return _json(exc.status_code, error_body(code, message), getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Log the real cause server-side; never leak internals (SQL, stack traces) to clients.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return _json(500, error_body("INTERNAL_ERROR", "Unexpected server error."))

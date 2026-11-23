"""Shared response envelope (same shape as ApiResponse<T> in frontend/src/lib/types.ts)."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ApiError(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T | None = None
    error: ApiError | None = None
    meta: dict[str, Any] | None = None


def ok(data: Any, **meta: Any) -> dict[str, Any]:
    """Success envelope. Returned as a dict so FastAPI validates it against response_model once."""
    body: dict[str, Any] = {"success": True, "data": data}
    if meta:
        body["meta"] = meta
    return body


class Entity(BaseModel):
    """Base for domain records: tolerant of extra DB columns, assignable for in-memory updates."""

    model_config = ConfigDict(extra="ignore", validate_assignment=False, from_attributes=True)

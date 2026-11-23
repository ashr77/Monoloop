"""Health check, AI extraction and voice transcription."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import ContainerDep
from app.schemas.common import ApiResponse, ok
from app.schemas.inputs import ExtractMaterialRequest
from app.services.ai.extraction import ExtractionFailed, MaterialExtraction
from app.services.matching.engine import ENGINE_VERSION

router = APIRouter(prefix="/api")


@router.get("/health", tags=["system"])
async def health(c: ContainerDep):
    """Liveness + which data backend is active (and whether the database answers)."""
    database = "not_configured"
    if c.engine is not None:
        try:
            async with c.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            database = "ok"
        except Exception:  # noqa: BLE001 - health must report, not raise
            database = "unreachable"
    elif c.rest is not None:
        try:
            r = await c.rest.get("/organizations", params={"select": "id", "limit": "1"})
            database = "ok" if r.status_code == 200 else "unreachable"
        except Exception:  # noqa: BLE001
            database = "unreachable"
    return ok({"status": "ok", "data_backend": c.repos.backend, "database": database,
               "engine_version": ENGINE_VERSION, "ai_configured": c.settings.ai_configured})


@router.post("/ai/extract-material", response_model=ApiResponse[MaterialExtraction], tags=["supply"])
async def extract_material(body: ExtractMaterialRequest, c: ContainerDep):
    """Extract listing fields from a free-text description. On provider failure this returns
    200 with success=false (code AI_UNAVAILABLE) so the form falls back to manual entry."""
    try:
        return ok(await c.extraction.extract(body.prompt, mock=bool(body.mock)))
    except ExtractionFailed as exc:
        return {"success": False, "error": {"code": "AI_UNAVAILABLE", "message": str(exc)}}

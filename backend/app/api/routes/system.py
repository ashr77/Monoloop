"""Health check, AI extraction and voice transcription."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import ContainerDep
from app.schemas.common import ApiResponse, ok
from app.schemas.inputs import ExtractMaterialRequest, ExtractRequirementRequest, TranscribeAudioRequest
from app.services.ai.extraction import ExtractionFailed, MaterialExtraction, RequirementExtraction
from app.services.ai.transcription import Transcription
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
            database = "ok" if r.status_code == 200 else f"error (HTTP {r.status_code})"
        except Exception as exc:  # noqa: BLE001 - health reports the failure type, never details
            database = f"unreachable ({type(exc).__name__})"
    return ok({"status": "ok", "data_backend": c.repos.backend, "database": database,
               "engine_version": ENGINE_VERSION, "ai_configured": c.settings.ai_configured,
               "payment_configured": c.payments.enabled,
               "auth_mode": c.settings.auth_mode})


@router.post("/ai/extract-material", response_model=ApiResponse[MaterialExtraction], tags=["supply"])
async def extract_material(body: ExtractMaterialRequest, c: ContainerDep):
    """Extract listing fields from a free-text description. On provider failure this returns
    200 with success=false (code AI_UNAVAILABLE) so the form falls back to manual entry."""
    try:
        return ok(await c.extraction.extract(body.prompt, mock=bool(body.mock)))
    except ExtractionFailed as exc:
        return {"success": False, "error": {"code": "AI_UNAVAILABLE", "message": str(exc)}}


@router.post("/ai/transcribe", response_model=ApiResponse[Transcription], tags=["supply"])
async def transcribe_audio(body: TranscribeAudioRequest, c: ContainerDep):
    """Speech-to-text fallback for the voice listing assistant (browsers without the Web Speech API).
    Accepts a short base64 recording in English, Bangla or Japanese. Failures return 200 with
    success=false (code AI_UNAVAILABLE) so the supplier can type instead."""
    try:
        return ok(await c.transcription.transcribe(body.audio_base64, body.mime_type, body.language))
    except ExtractionFailed as exc:
        return {"success": False, "error": {"code": "AI_UNAVAILABLE", "message": str(exc)}}


@router.post("/ai/extract-requirement", response_model=ApiResponse[RequirementExtraction], tags=["demand"])
async def extract_requirement(body: ExtractRequirementRequest, c: ContainerDep):
    try:
        return ok(await c.extraction.extract_requirement(body.prompt, mock=bool(body.mock)))
    except ExtractionFailed as exc:
        return {"success": False, "error": {"code": "AI_UNAVAILABLE", "message": str(exc)}}

"""Voice input: multilingual extraction and the server-side transcription fallback."""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from app.api.deps import build_container
from app.main import create_app
from tests.conftest import make_settings

AUDIO = base64.b64encode(b"\x1aE\xdf\xa3fake-webm-opus-bytes" * 20).decode()


@pytest.mark.parametrize("prompt", [
    "৪০ পিস অব্যবহৃত স্টেইনলেস স্টিল SS304 শিট, ১০০০ x ৫০০ মিমি, ২ মিমি পুরু, প্রতি শিট ৪৫০ টাকা, গাজীপুর",
    "ステンレス SS304 未使用 40枚、1000×500ミリ、厚さ2ミリ、1枚450タカ、ガジプール",
])
async def test_mock_parser_understands_bangla_and_japanese(client, prompt):
    d = (await client.post("/api/ai/extract-material", json={"prompt": prompt, "mock": True})).json()["data"]
    assert d["material_specification"] == "SS304" and d["total_quantity"] == 40
    assert (d["length_mm"], d["width_mm"], d["thickness_mm"]) == (1000, 500, 2)
    assert d["unit_price_bdt"] == 450 and d["city"] == "Gazipur" and d["condition"] == "UNUSED"


@pytest.mark.parametrize(("prompt", "qty"), [
    ("We have 40 unused SS304 sheets 1000 by 500 mm 2mm thick 450 taka each in Gazipur", 40),
    ("40 unused stainless steel sheets, grade SS 316", 40),
    ("Surplus 50 pieces commercial plywood panels, 2440x1220 mm", 50),
    ("SS201 offcut, 2mm thick, 12 sheets", 12),
])
async def test_mock_parser_quantity_ignores_grade_numbers(client, prompt, qty):
    d = (await client.post("/api/ai/extract-material", json={"prompt": prompt, "mock": True})).json()["data"]
    assert d["total_quantity"] == qty


async def test_transcribe_unconfigured_is_soft_failure(client):
    r = await client.post("/api/ai/transcribe", json={"audio_base64": AUDIO, "mime_type": "audio/webm"})
    assert r.status_code == 200
    assert r.json()["success"] is False and r.json()["error"]["code"] == "AI_UNAVAILABLE"


@pytest.mark.parametrize("body", [
    {"audio_base64": AUDIO, "mime_type": "video/mp4"},
    {"audio_base64": AUDIO, "mime_type": "audio/webm", "language": "fr-FR"},
    {"audio_base64": AUDIO, "mime_type": "audio/webm", "extra": 1},
])
async def test_transcribe_rejects_bad_input(client, body):
    assert (await client.post("/api/ai/transcribe", json=body)).status_code == 400


async def _configured_client(handler, **overrides):
    settings = make_settings(ai_api_key="test-key", ai_retry_backoff_seconds=0, **overrides)
    app = create_app(settings)
    container = build_container(settings)
    container.transcription.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app.state.container = container
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test"), container


async def test_transcribe_gemini_strips_codecs_and_returns_transcript():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers.get("x-goog-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": " ステンレス 40枚 \n"}]}}]})

    c, container = await _configured_client(handler)
    async with c:
        r = (await c.post("/api/ai/transcribe", json={
            "audio_base64": AUDIO, "mime_type": "audio/webm;codecs=opus", "language": "ja-JP"})).json()
    await container.aclose()
    assert r["success"] and r["data"] == {"transcript": "ステンレス 40枚", "language": "ja-JP"}
    parts = seen["body"]["contents"][0]["parts"]
    assert seen["key"] == "test-key" and "Japanese" in parts[0]["text"]
    assert parts[1]["inlineData"] == {"mimeType": "audio/webm", "data": AUDIO}


async def test_transcribe_empty_speech_and_provider_error_are_soft():
    calls = []

    def handler(_req):  # first: silence; afterwards: a provider that stays down (retried each time)
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "  "}]}}]})
        return httpx.Response(500, json={})

    c, container = await _configured_client(handler)
    async with c:
        for _ in range(2):
            r = (await c.post("/api/ai/transcribe", json={"audio_base64": AUDIO, "mime_type": "audio/ogg"})).json()
            assert r["success"] is False and r["error"]["code"] == "AI_UNAVAILABLE"
    await container.aclose()


async def test_audio_route_has_its_own_body_limit():
    settings = make_settings(max_body_bytes=1024, max_audio_bytes=10_000)
    app = create_app(settings)
    app.state.container = build_container(settings)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        small = base64.b64encode(b"x" * 5000).decode()  # > 1 KB JSON limit, < audio limit
        r = await c.post("/api/ai/transcribe", json={"audio_base64": small, "mime_type": "audio/webm"})
        assert r.status_code == 200
        big = base64.b64encode(b"x" * 20_000).decode()
        r = await c.post("/api/ai/transcribe", json={"audio_base64": big, "mime_type": "audio/webm"})
        assert r.status_code == 413
        # Other routes keep the small limit.
        r = await c.post("/api/ai/extract-material", json={"prompt": "x" * 1500})
        assert r.status_code == 413
    await app.state.container.aclose()


# --------------------------------------------------------------------------- provider overload resilience

PROMPT_JA = "ステンレス SS304 未使用 40枚、1000×500ミリ、厚さ2ミリ、1枚450タカ、ガジプール"
GEMINI_OK = {"candidates": [{"content": {"parts": [{"text": json.dumps({
    "material_family": "STAINLESS_STEEL_SHEET", "material_specification": "SS304", "length_mm": 1000,
    "width_mm": 500, "thickness_mm": 2, "total_quantity": 40, "quantity_unit": "PIECE", "condition": "UNUSED",
    "unit_price_bdt": 450, "city": "Gazipur", "raw_notes": None, "missing_fields": [], "confidence_scores": {}})}]}}]}


async def _extract_client(handler):
    settings = make_settings(ai_api_key="test-key", ai_retry_backoff_seconds=0)
    app = create_app(settings)
    container = build_container(settings)
    container.extraction.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app.state.container = container
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test"), container


async def test_extraction_retries_transient_overload():
    calls = []

    def handler(_req):
        calls.append(1)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json=GEMINI_OK)

    c, container = await _extract_client(handler)
    async with c:
        r = (await c.post("/api/ai/extract-material", json={"prompt": PROMPT_JA})).json()
    await container.aclose()
    assert len(calls) == 3 and r["success"] and r["data"]["source"] == "ai"


async def test_extraction_falls_back_to_offline_parser_when_provider_stays_down():
    def handler(_req):
        raise httpx.ReadTimeout("slow")

    c, container = await _extract_client(handler)
    async with c:
        r = (await c.post("/api/ai/extract-material", json={"prompt": PROMPT_JA})).json()
        d = r["data"]
        assert r["success"] and d["source"] == "heuristic" and d["total_quantity"] == 40
        assert "offline parser" in d["raw_notes"]
        # Nothing the parser can use: the provider failure is reported instead.
        r = (await c.post("/api/ai/extract-material", json={"prompt": "hello there, anything?"})).json()
        assert r["success"] is False and r["error"]["code"] == "AI_UNAVAILABLE"
    await container.aclose()


async def test_extraction_does_not_retry_client_errors():
    calls = []

    def handler(_req):
        calls.append(1)
        return httpx.Response(400)

    c, container = await _extract_client(handler)
    async with c:
        await c.post("/api/ai/extract-material", json={"prompt": PROMPT_JA})
    await container.aclose()
    assert len(calls) == 1


@pytest.mark.parametrize("prompt", [
    "আমার ১০০ পিস SS304 স্টেইনলেস স্টিল শিট লাগবে, দৈর্ঘ্য ১৫০০ থেকে ২০০০ মিমি, প্রস্থ ৮০০ থেকে ১০০০ মিমি, "
    "পুরুত্ব ২ থেকে ৩ মিমি, বাজেট ৫০০০০ টাকা",
    "SS304ステンレス鋼板が100枚必要です。長さ1500から2000ミリ、幅800から1000ミリ、厚さ2から3ミリ、予算50000タカ",
])
def test_requirement_parser_understands_spoken_bangla_and_japanese(prompt):
    from app.services.ai.extraction import extract_requirement_with_heuristics

    r = extract_requirement_with_heuristics(prompt)
    assert (r.material_family, r.material_specification) == ("STAINLESS_STEEL_SHEET", "SS304")
    assert (r.length_min_mm, r.length_max_mm, r.width_min_mm, r.width_max_mm) == (1500, 2000, 800, 1000)
    assert (r.thickness_min_mm, r.thickness_max_mm) == (2, 3)
    assert r.required_quantity == 100 and r.maximum_budget_bdt == 50000

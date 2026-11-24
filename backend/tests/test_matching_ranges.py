"""Requirement dimension ranges (migration 00005) in the matching engine.

Per axis a requirement has an exact value, a range (min, optional max) or nothing (any size).
Exact-size behaviour is pinned by test_engine_parity.py; these tests cover ranges and "any".
"""

from __future__ import annotations

import pytest

from app.services.matching.engine import run_matching
from tests.test_matching_engine import check, listing, requirement

RANGE = dict(length_mm=None, width_mm=None, length_min_mm=2000, length_max_mm=2500,
             width_min_mm=1000, width_max_mm=1300)


def test_range_requirement_no_longer_crashes_and_matches():
    """The live failure: length/width given only as ranges used to raise TypeError (500)."""
    ok = listing(length_mm=2440, width_mm=1220)
    r = run_matching(requirement(**RANGE), [ok])
    assert r.matching_status != "NO_MATCH"
    c = check(r, ok.id, "DIMENSIONS")
    assert c.passed and c.expected == "2000–2500×1000–1300 mm" and c.actual == "2440×1220 mm"
    assert c.message == "Size 2440×1220 mm is within the required length 2000–2500 mm × width 1000–1300 mm."


@pytest.mark.parametrize(("length", "width", "passes"), [
    (2000, 1000, True),       # exactly on the minimums
    (2500, 1300, True),       # exactly on the maximums
    (2500.005, 1300, True),   # within the 0.01 mm tolerance
    (2600, 1200, False),      # too long: sheets are not cut down
    (1999, 1200, False),      # too short
    (2400, 900, False),       # too narrow
])
def test_range_bounds(length, width, passes):
    l = listing(length_mm=length, width_mm=width)
    c = check(run_matching(requirement(**RANGE), [l]), l.id, "DIMENSIONS")
    assert c.passed is passes
    if not passes:
        assert "outside the required" in c.message and "not cut down" in c.message


def test_range_accepts_rotated_sheet():
    l = listing(length_mm=1200, width_mm=2400)  # fits only when turned 90°
    r = run_matching(requirement(**RANGE), [l])
    c = check(r, l.id, "DIMENSIONS")
    assert c.passed and c.message.endswith("when rotated 90°.")
    ev = next(e for e in r.evaluations if e.listing_id == l.id)
    assert "(rotated)" in ev.reason


def test_min_only_means_at_least():
    req = requirement(length_mm=None, width_mm=None, length_min_mm=2000, width_min_mm=1000)
    big, small = listing(length_mm=3000, width_mm=1500), listing(length_mm=1800, width_mm=1500)
    r = run_matching(req, [big, small])
    assert check(r, big.id, "DIMENSIONS").passed and check(r, big.id, "DIMENSIONS").expected == "≥ 2000×≥ 1000 mm"
    assert not check(r, small.id, "DIMENSIONS").passed


def test_mixed_exact_and_range_axes():
    req = requirement(length_mm=2440, width_mm=None, width_min_mm=1200, width_max_mm=1250)
    fits, wrong_length = listing(length_mm=2440, width_mm=1220), listing(length_mm=2400, width_mm=1220)
    r = run_matching(req, [fits, wrong_length])
    assert check(r, fits.id, "DIMENSIONS").passed
    assert not check(r, wrong_length.id, "DIMENSIONS").passed
    assert check(r, fits.id, "DIMENSIONS").expected == "2440×1200–1250 mm"


def test_unspecified_size_accepts_any():
    req = requirement(length_mm=None, width_mm=None)
    l = listing(length_mm=777, width_mm=333)
    c = check(run_matching(req, [l]), l.id, "DIMENSIONS")
    assert c.passed and c.expected == "any×any mm"


def test_thickness_range_any_and_exact():
    in_range, too_thick = listing(thickness_mm=1.5), listing(thickness_mm=3)
    r = run_matching(requirement(thickness_mm=None, thickness_min_mm=1, thickness_max_mm=2), [in_range, too_thick])
    assert check(r, in_range.id, "THICKNESS").passed
    assert check(r, in_range.id, "THICKNESS").message == "Thickness 1.5 mm is within the required 1–2 mm."
    assert check(r, too_thick.id, "THICKNESS").message == "Thickness 3 mm is outside the required 1–2 mm."
    anything = listing(thickness_mm=9)
    c = check(run_matching(requirement(thickness_mm=None), [anything]), anything.id, "THICKNESS")
    assert c.passed and c.message == "Any thickness accepted (listing is 9 mm)."
    # exact thickness keeps the original wording
    c = check(run_matching(requirement(), [too_thick]), too_thick.id, "THICKNESS")
    assert c.message == "Thickness 3 mm does not match required 2 mm."


def test_listing_with_missing_size_still_fails_closed():
    l = listing(length_mm=0)
    c = check(run_matching(requirement(**RANGE), [l]), l.id, "DIMENSIONS")
    assert not c.passed and c.message == "Dimensions are missing or invalid; compatibility cannot be assumed."


def test_exact_requirement_wording_unchanged():
    l = listing(length_mm=2400, width_mm=1000)
    c = check(run_matching(requirement(), [l]), l.id, "DIMENSIONS")
    assert c.message == "Size 2400×1000 mm does not match required 2400×1200 mm (sheets are not cut down)."


async def test_matches_overview_with_a_range_requirement(client):
    """Regression: one range-only requirement made GET /api/matches return 500 for everyone."""
    from tests.conftest import BUYER_APEX, as_org

    body = {"organization_id": BUYER_APEX, "material_family": "PLYWOOD_PANEL",
            "material_specification": "PLYWOOD_STANDARD", "length_min_mm": 5, "length_max_mm": 1200,
            "width_min_mm": 5, "width_max_mm": 600, "thickness_mm": 12, "required_quantity": 10}
    created = (await client.post("/api/requirements", json=body, headers=as_org(BUYER_APEX))).json()
    assert created["success"], created
    rid = created["data"]["id"]

    overview = await client.get("/api/matches")
    assert overview.status_code == 200 and any(row["requirement"]["id"] == rid for row in overview.json()["data"])
    one = (await client.get(f"/api/matches/{rid}", headers=as_org(BUYER_APEX))).json()
    assert one["success"]
    # 1200×600×12 plywood offcut in the seed data fits the range
    dims = [c for e in one["data"]["evaluations"] for c in e["checks"] if c["rule"] == "DIMENSIONS"]
    assert any(c["passed"] for c in dims)

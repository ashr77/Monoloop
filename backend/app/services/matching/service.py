"""Matching application service (Member 3): loads data through repositories, runs the pure engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.repositories.base import ListingFilter, Repositories, RequirementFilter
from app.schemas.entities import Listing, Requirement
from app.schemas.matching import MatchResult
from app.services.matching.engine import run_matching


@dataclass(frozen=True, slots=True)
class MatchOutcome:
    kind: Literal["OK", "NOT_FOUND", "NOT_OPEN"]
    requirement: Requirement | None = None
    result: MatchResult | None = None


class MatchingService:
    def __init__(self, repos: Repositories):
        self.repos = repos

    async def _buyer(self, req: Requirement):
        return req.organization or await self.repos.organizations.get(req.organization_id)

    async def match(self, requirement_id: str) -> MatchOutcome:
        req = await self.repos.requirements.get(requirement_id)
        if not req:
            return MatchOutcome("NOT_FOUND")
        if req.status != "OPEN":
            return MatchOutcome("NOT_OPEN", req)
        # The engine needs every listing of the family (rejections are explained too).
        listings = await self.repos.listings.list(ListingFilter(material_family=req.material_family))
        result = run_matching(req, listings, await self._buyer(req))
        return MatchOutcome("OK", req, result)

    async def match_all_open(self) -> list[tuple[Requirement, MatchResult]]:
        """Overview: every open requirement in 2 queries total (not 1 + 2·N)."""
        open_reqs = await self.repos.requirements.list(RequirementFilter(status="OPEN"))
        if not open_reqs:
            return []
        families = tuple(sorted({r.material_family for r in open_reqs}))
        listings = await self.repos.listings.list(ListingFilter(material_families=families))
        by_family: dict[str, list[Listing]] = {}
        for l in listings:
            by_family.setdefault(l.material_family, []).append(l)
        return [(r, run_matching(r, by_family.get(r.material_family, []), r.organization)) for r in open_reqs]

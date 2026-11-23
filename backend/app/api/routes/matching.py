"""Explainable matching (Member 3)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.core.errors import AppError
from app.schemas.common import ApiResponse, ok
from app.schemas.entities import Requirement
from app.schemas.matching import MatchResult
from app.services.matching.evaluation import EvaluationReport, evaluate

router = APIRouter(prefix="/api", tags=["matching"])


class MatchOverviewRow(BaseModel):
    requirement: Requirement
    result: MatchResult


@router.get("/matches", response_model=ApiResponse[list[MatchOverviewRow]])
async def match_all_open(c: ContainerDep):
    """Live match status of every OPEN requirement (computed in two queries in total)."""
    rows = await c.matching.match_all_open()
    fulfilled = sum(1 for _, r in rows if r.unfulfilled_quantity == 0 and r.allocations)
    return ok([{"requirement": req, "result": res} for req, res in rows], total=len(rows), fulfillable=fulfilled)


@router.get("/matches/evaluation", response_model=ApiResponse[EvaluationReport])
async def evaluation():
    """MONOLOOP vs a name-only marketplace search on the hand-labelled evaluation dataset."""
    return ok(evaluate())


@router.get(
    "/matches/{requirement_id}",
    response_model=ApiResponse[MatchResult],
    responses={404: {"description": "Requirement not found"}, 409: {"description": "Requirement is not OPEN"}},
)
async def match_requirement(requirement_id: Annotated[str, Path(max_length=64)], c: ContainerDep):
    """Compatible suppliers, the optimal allocation, estimated delivered cost and the reason behind
    every acceptance or rejection. A proposal is not a reservation."""
    outcome = await c.matching.match(requirement_id)
    if outcome.kind == "NOT_FOUND":
        raise AppError("NOT_FOUND", f"Requirement '{requirement_id}' was not found.")
    if outcome.kind == "NOT_OPEN":
        raise AppError("REQUIREMENT_NOT_OPEN",
                       f"Requirement is {outcome.requirement.status}; only OPEN requirements are matched.",
                       {"requirement_status": outcome.requirement.status})
    result = outcome.result
    return ok(result, compatible_listings=sum(1 for e in result.evaluations if e.compatible),
              evaluated_listings=len(result.evaluations), requirement=outcome.requirement.model_dump())

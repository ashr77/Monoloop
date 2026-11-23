"""MatchResult: superset of the frozen MatchProposal contract (frontend/src/features/matching/types.ts)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.domain.constants import MatchingStatus

RuleId = Literal[
    "LISTING_ACTIVE",
    "NOT_OWN_LISTING",
    "MATERIAL_FAMILY",
    "SPECIFICATION",
    "DIMENSIONS",
    "THICKNESS",
    "CONDITION",
    "AVAILABILITY",
]
BudgetStatus = Literal["NO_BUDGET", "WITHIN_BUDGET", "OVER_BUDGET", "NOT_APPLICABLE"]
AllocationMethod = Literal["EXHAUSTIVE_OPTIMAL", "GREEDY", "NONE"]


class RuleCheck(BaseModel):
    rule: RuleId
    passed: bool
    expected: str
    actual: str
    message: str


class ListingEvaluation(BaseModel):
    listing_id: str
    supplier_organization_id: str
    supplier_name: str
    city: str
    material_specification: str
    dimensions: str
    condition: str
    available_quantity: int
    unit_price_bdt: float
    compatible: bool
    rotated: bool
    checks: list[RuleCheck]
    reason: str
    allocated_quantity: int = 0


class MatchAllocationDetail(BaseModel):
    listing_id: str
    supplier_organization_id: str
    supplier_name: str
    allocated_quantity: int
    unit_price_bdt: float
    subtotal_bdt: float
    city: str
    technical_notes: str
    estimated_transport_bdt: float
    distance_km: float


class BudgetAssessment(BaseModel):
    status: BudgetStatus
    maximum_budget_bdt: float | None
    cheapest_estimated_cost_bdt: float | None
    message: str


class BaselineComparison(BaseModel):
    suggested_listing_ids: list[str]
    incompatible_suggestion_ids: list[str]
    claimed_quantity: int
    message: str


class MatchResult(BaseModel):
    # --- Frozen MatchProposal contract ---
    requirement_id: str
    requested_quantity: int
    matching_status: MatchingStatus
    allocations: list[MatchAllocationDetail]
    compatible_supplier_ids: list[str]
    listing_ids: list[str]
    allocated_quantities: dict[str, int]
    estimated_material_costs_bdt: float
    estimated_transportation_costs_bdt: float
    total_estimated_cost_bdt: float
    compatibility_explanations: list[str]
    rejection_reasons: list[str]
    unfulfilled_quantity: int
    # --- Explainability extensions ---
    engine_version: str
    generated_at: str
    requirement_status: str
    allow_split_suppliers: bool
    allocated_quantity: int
    evaluations: list[ListingEvaluation]
    budget: BudgetAssessment
    baseline: BaselineComparison
    allocation_method: AllocationMethod
    over_budget_alternative: list[MatchAllocationDetail] | None = None

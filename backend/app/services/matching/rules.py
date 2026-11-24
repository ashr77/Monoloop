"""Stage 1: mandatory compatibility rules (Strategy pattern).

Each rule is a small strategy object with one job: check one engineering constraint and explain
the outcome. The engine runs them all in a fixed order (no short-circuit), so the UI can show a
complete pass/fail breakdown. A listing is compatible only if every rule passes. Unknown or
missing specifications fail: compatibility is never silently assumed.

Adding a rule = adding one class to RULES; nothing else changes (open/closed principle).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

from app.domain.constants import MATERIAL_CONDITIONS, MATERIAL_SPECIFICATIONS
from app.schemas.entities import Listing, Requirement
from app.schemas.matching import ListingEvaluation, RuleCheck
from app.services.matching.formatting import fmt, format_size, js_str

DIMENSION_TOLERANCE_MM = 0.01


def same_mm(a: float, b: float) -> bool:
    return abs(a - b) <= DIMENSION_TOLERANCE_MM


def is_positive(n: object) -> bool:
    return isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) and n > 0


def is_known_specification(family: str, spec: str) -> bool:
    return spec in MATERIAL_SPECIFICATIONS.get(family, ())


def available_quantity(listing: Listing) -> int:
    """Available stock, recomputed defensively from total − reserved and never negative."""
    total = float(listing.total_quantity or 0)
    reserved = float(listing.reserved_quantity or 0)
    return max(0, math.floor(total - reserved))


@dataclass(frozen=True, slots=True)
class RuleContext:
    requirement: Requirement
    listing: Listing
    buyer_organization_id: str


class CompatibilityRule(Protocol):
    def check(self, ctx: RuleContext) -> RuleCheck: ...


class ListingActiveRule:
    """Archived, completed or fully reserved listings are not offered."""

    def check(self, ctx: RuleContext) -> RuleCheck:
        status = ctx.listing.status
        ok = status == "ACTIVE"
        return RuleCheck(
            rule="LISTING_ACTIVE", passed=ok, expected="ACTIVE", actual=status,
            message="Listing is active." if ok else f"Listing is {status.lower()}, not active.",
        )


class NotOwnListingRule:
    """A buyer never sources from itself (relevant for HYBRID organizations)."""

    def check(self, ctx: RuleContext) -> RuleCheck:
        own = ctx.listing.organization_id == ctx.buyer_organization_id
        return RuleCheck(
            rule="NOT_OWN_LISTING", passed=not own, expected="Another organization",
            actual="Same organization" if own else "Another organization",
            message="Listing belongs to the requesting organization." if own else "Listing is from another organization.",
        )


class MaterialFamilyRule:
    def check(self, ctx: RuleContext) -> RuleCheck:
        r, l = ctx.requirement, ctx.listing
        ok = l.material_family == r.material_family
        return RuleCheck(
            rule="MATERIAL_FAMILY", passed=ok, expected=r.material_family, actual=l.material_family,
            message="Material family matches." if ok
            else f"Material family {l.material_family} does not match required {r.material_family}.",
        )


class SpecificationRule:
    """Exact grade; both sides must be recognised standards (no substitution)."""

    def check(self, ctx: RuleContext) -> RuleCheck:
        r, l = ctx.requirement, ctx.listing
        req_known = is_known_specification(r.material_family, r.material_specification)
        lst_known = is_known_specification(l.material_family, l.material_specification)
        ok = req_known and lst_known and l.material_specification == r.material_specification
        if ok:
            message = f"Grade {l.material_specification} matches."
        elif not lst_known:
            message = (f'Listing specification "{l.material_specification or "missing"}" is not a recognised '
                       "standard; compatibility cannot be assumed.")
        elif not req_known:
            message = f'Required specification "{r.material_specification or "missing"}" is not a recognised standard.'
        else:
            message = f"Grade {l.material_specification} does not satisfy required {r.material_specification}."
        return RuleCheck(
            rule="SPECIFICATION", passed=ok, expected=r.material_specification or "(missing)",
            actual=l.material_specification or "(missing)", message=message,
        )


@dataclass(frozen=True, slots=True)
class AxisSpec:
    """What a requirement asks for on one axis (migration 00005: exact XOR range, or nothing).

    exact            the value must match (within DIMENSION_TOLERANCE_MM)
    minimum/maximum  the value must lie in [minimum, maximum]; no maximum = "at least minimum"
    neither          any value is accepted on this axis
    """

    exact: float | None = None
    minimum: float | None = None
    maximum: float | None = None

    @classmethod
    def of(cls, requirement: Requirement, axis: str) -> AxisSpec:
        return cls(getattr(requirement, f"{axis}_mm", None), getattr(requirement, f"{axis}_min_mm", None),
                   getattr(requirement, f"{axis}_max_mm", None))

    @property
    def is_exact(self) -> bool:
        return self.exact is not None

    @property
    def is_any(self) -> bool:
        return self.exact is None and self.minimum is None and self.maximum is None

    @property
    def valid(self) -> bool:
        if self.is_exact:
            return is_positive(self.exact)
        if self.is_any:
            return True
        return (is_positive(self.minimum) and (self.maximum is None or is_positive(self.maximum))
                and (self.maximum is None or self.minimum <= self.maximum + DIMENSION_TOLERANCE_MM))

    def accepts(self, value: float) -> bool:
        if self.is_exact:
            return same_mm(value, self.exact)
        if self.is_any:
            return True
        if value < self.minimum - DIMENSION_TOLERANCE_MM:
            return False
        return self.maximum is None or value <= self.maximum + DIMENSION_TOLERANCE_MM

    def describe(self) -> str:
        """Short form without unit: "2440", "2000–2500", "≥ 1200", "any"."""
        if self.is_exact:
            return fmt(self.exact)
        if self.is_any:
            return "any"
        if self.maximum is None:
            return f"≥ {fmt(self.minimum)}"
        return f"{fmt(self.minimum)}–{fmt(self.maximum)}"


def _size_specs(ctx: RuleContext) -> tuple[AxisSpec, AxisSpec]:
    return AxisSpec.of(ctx.requirement, "length"), AxisSpec.of(ctx.requirement, "width")


def _size_fit(ctx: RuleContext) -> tuple[bool, bool, bool]:
    """(valid, direct, rotated) for exact sizes and for ranges alike."""
    l = ctx.listing
    length, width = _size_specs(ctx)
    valid = is_positive(l.length_mm) and is_positive(l.width_mm) and length.valid and width.valid
    direct = valid and length.accepts(l.length_mm) and width.accepts(l.width_mm)
    rotated = valid and not direct and length.accepts(l.width_mm) and width.accepts(l.length_mm)
    return valid, direct, rotated


class DimensionsRule:
    """Length × width in either orientation; larger sheets are never cut down.

    Exact requirements must match exactly (the original rule, unchanged). Range requirements accept
    any size inside the buyer's min–max per axis; an axis with no value accepts any size.
    """

    def check(self, ctx: RuleContext) -> RuleCheck:
        l = ctx.listing
        length, width = _size_specs(ctx)
        if length.is_exact and width.is_exact:
            return self._exact(ctx)
        valid, direct, rotated = _size_fit(ctx)
        wanted = f"length {length.describe()} mm × width {width.describe()} mm"
        if not valid:
            message = "Dimensions are missing or invalid; compatibility cannot be assumed."
        elif direct:
            message = f"Size {format_size(l.length_mm, l.width_mm)} is within the required {wanted}."
        elif rotated:
            message = f"Size {format_size(l.length_mm, l.width_mm)} is within the required {wanted} when rotated 90°."
        else:
            message = f"Size {format_size(l.length_mm, l.width_mm)} is outside the required {wanted} (sheets are not cut down)."
        actual = format_size(l.length_mm, l.width_mm) if is_positive(l.length_mm) and is_positive(l.width_mm) else "(missing)"
        return RuleCheck(
            rule="DIMENSIONS", passed=direct or rotated, expected=f"{length.describe()}×{width.describe()} mm",
            actual=actual, message=message,
        )

    @staticmethod
    def _exact(ctx: RuleContext) -> RuleCheck:
        r, l = ctx.requirement, ctx.listing
        valid = all(is_positive(v) for v in (l.length_mm, l.width_mm, r.length_mm, r.width_mm))
        direct = valid and same_mm(l.length_mm, r.length_mm) and same_mm(l.width_mm, r.width_mm)
        rotated = valid and not direct and same_mm(l.length_mm, r.width_mm) and same_mm(l.width_mm, r.length_mm)
        if not valid:
            message = "Dimensions are missing or invalid; compatibility cannot be assumed."
        elif direct:
            message = "Length and width match exactly."
        elif rotated:
            message = "Length and width match when the sheet is rotated 90°."
        else:
            message = (f"Size {format_size(l.length_mm, l.width_mm)} does not match required "
                       f"{format_size(r.length_mm, r.width_mm)} (sheets are not cut down).")
        return RuleCheck(
            rule="DIMENSIONS", passed=direct or rotated, expected=format_size(r.length_mm, r.width_mm),
            actual=format_size(l.length_mm, l.width_mm), message=message,
        )

    @staticmethod
    def is_rotated(ctx: RuleContext) -> bool:
        return _size_fit(ctx)[2]


class ThicknessRule:
    """Exact thickness must match; a range accepts min–max; no value accepts any thickness."""

    def check(self, ctx: RuleContext) -> RuleCheck:
        r, l = ctx.requirement, ctx.listing
        spec = AxisSpec.of(r, "thickness")
        if spec.is_exact:
            valid = is_positive(l.thickness_mm) and is_positive(r.thickness_mm)
            ok = valid and same_mm(l.thickness_mm, r.thickness_mm)
            if not valid:
                message = "Thickness is missing or invalid; compatibility cannot be assumed."
            elif ok:
                message = "Thickness matches."
            else:
                message = f"Thickness {fmt(l.thickness_mm)} mm does not match required {fmt(r.thickness_mm)} mm."
            return RuleCheck(
                rule="THICKNESS", passed=ok, expected=f"{fmt(r.thickness_mm)} mm",
                actual=f"{fmt(l.thickness_mm)} mm", message=message,
            )
        valid = is_positive(l.thickness_mm) and spec.valid
        ok = valid and spec.accepts(l.thickness_mm)
        actual = f"{fmt(l.thickness_mm)} mm" if is_positive(l.thickness_mm) else "(missing)"
        if not valid:
            message = "Thickness is missing or invalid; compatibility cannot be assumed."
        elif spec.is_any:
            message = f"Any thickness accepted (listing is {fmt(l.thickness_mm)} mm)."
        elif ok:
            message = f"Thickness {fmt(l.thickness_mm)} mm is within the required {spec.describe()} mm."
        else:
            message = f"Thickness {fmt(l.thickness_mm)} mm is outside the required {spec.describe()} mm."
        return RuleCheck(rule="THICKNESS", passed=ok, expected=f"{spec.describe()} mm", actual=actual, message=message)


class ConditionRule:
    """ANY accepts every recognised condition; otherwise the condition must be equal."""

    def check(self, ctx: RuleContext) -> RuleCheck:
        required, cond = ctx.requirement.condition_requirement, ctx.listing.condition
        known = cond in MATERIAL_CONDITIONS
        ok = known and (required == "ANY" or required == cond)
        if not known:
            message = "Listing condition is unknown; compatibility cannot be assumed."
        elif ok:
            message = (f"Any condition accepted (listing is {cond.lower()})." if required == "ANY"
                       else f"Condition {cond.lower()} matches.")
        else:
            message = f"Condition {cond.lower()} does not satisfy required {required.lower()}."
        return RuleCheck(rule="CONDITION", passed=ok, expected=required, actual=cond or "(missing)", message=message)


class AvailabilityRule:
    """Uses total − reserved, never total stock."""

    def check(self, ctx: RuleContext) -> RuleCheck:
        l = ctx.listing
        available = available_quantity(l)
        return RuleCheck(
            rule="AVAILABILITY", passed=available > 0, expected="> 0 pieces",
            actual=f"{available} available ({js_str(l.total_quantity)} total, {js_str(l.reserved_quantity)} reserved)",
            message=f"{available} pieces available." if available > 0
            else f"No unreserved stock ({js_str(l.reserved_quantity)} of {js_str(l.total_quantity)} reserved).",
        )


# Evaluation order is part of the contract (the first failure becomes the listing's reason).
RULES: tuple[CompatibilityRule, ...] = (
    ListingActiveRule(),
    NotOwnListingRule(),
    MaterialFamilyRule(),
    SpecificationRule(),
    DimensionsRule(),
    ThicknessRule(),
    ConditionRule(),
    AvailabilityRule(),
)


def evaluate_listing(requirement: Requirement, listing: Listing, buyer_organization_id: str) -> ListingEvaluation:
    ctx = RuleContext(requirement, listing, buyer_organization_id)
    checks = [rule.check(ctx) for rule in RULES]
    first_failure = next((c for c in checks if not c.passed), None)
    compatible = first_failure is None
    rotated = DimensionsRule.is_rotated(ctx)
    available = available_quantity(listing)
    reason = (
        f"Compatible: grade, size{' (rotated)' if rotated else ''}, thickness and condition match; {available} available."
        if compatible else first_failure.message
    )
    return ListingEvaluation(
        listing_id=listing.id,
        supplier_organization_id=listing.organization_id,
        supplier_name=listing.organization.name if listing.organization else "Unknown supplier",
        city=listing.city,
        material_specification=listing.material_specification,
        dimensions=f"{format_size(listing.length_mm, listing.width_mm)} × {fmt(listing.thickness_mm)} mm",
        condition=listing.condition,
        available_quantity=available,
        unit_price_bdt=float(listing.unit_price_bdt),
        compatible=compatible,
        rotated=rotated,
        checks=checks,
        reason=reason,
        allocated_quantity=0,
    )

"""Request bodies. Strict mode: no silent type coercion ("5" is not 5), unknown fields rejected,
bounded sizes. Mirrors the Zod schemas the Next.js API used, with tighter upper bounds."""

from __future__ import annotations

from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.domain.constants import (
    ConditionRequirement,
    ListingStatus,
    MaterialCondition,
    MaterialFamily,
    MaterialSpecification,
    QuantityUnit,
    RequirementStatus,
    is_specification_valid_for_family,
)
from app.schemas.entities import UuidStr

Mm = Annotated[float, Field(gt=0, le=100_000)]
Pieces = Annotated[int, Field(gt=0, le=1_000_000)]
Bdt = Annotated[float, Field(ge=0, le=1_000_000_000)]
City = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Text = Annotated[str, StringConstraints(max_length=2000)]


class StrictInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", str_strip_whitespace=True)


_NOT_WRITABLE = {"organization_id", "reserved_quantity", "quantity_unit", "caller_organization_id"}


def _check_spec(family: str | None, spec: str | None) -> None:
    if family and spec and not is_specification_valid_for_family(family, spec):
        raise ValueError("Invalid specification for selected material family")


def _clean_url(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if len(value) > 2048 or not value.lower().startswith(("https://", "http://")):
        raise ValueError("Must be a valid http(s) URL")
    return value


# --- Listings (Member 1) ------------------------------------------------------


class ListingCreate(StrictInput):
    organization_id: UuidStr
    material_family: MaterialFamily
    material_specification: MaterialSpecification
    length_mm: Mm
    width_mm: Mm
    thickness_mm: Mm
    total_quantity: Pieces
    quantity_unit: QuantityUnit = "PIECE"
    condition: MaterialCondition
    unit_price_bdt: Bdt
    description: Text | None = None
    image_url: str | None = None
    city: City
    status: ListingStatus = "ACTIVE"

    @field_validator("image_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        return _clean_url(value)

    @model_validator(mode="after")
    def _spec(self) -> Self:
        _check_spec(self.material_family, self.material_specification)
        return self


class ListingUpdate(StrictInput):
    material_family: MaterialFamily | None = None
    material_specification: MaterialSpecification | None = None
    length_mm: Mm | None = None
    width_mm: Mm | None = None
    thickness_mm: Mm | None = None
    total_quantity: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    condition: MaterialCondition | None = None
    unit_price_bdt: Bdt | None = None
    description: Text | None = None
    image_url: str | None = None
    city: City | None = None
    status: ListingStatus | None = None
    # Accepted for compatibility with the existing forms, validated by the service, never written:
    organization_id: UuidStr | None = Field(default=None, description="Must equal the current owner.")
    reserved_quantity: int | None = Field(default=None, description="Forbidden: only exchanges change it.")
    quantity_unit: QuantityUnit | None = None
    caller_organization_id: UuidStr | None = None

    @field_validator("image_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        return _clean_url(value)

    @model_validator(mode="after")
    def _spec(self) -> Self:
        _check_spec(self.material_family, self.material_specification)
        return self

    def changes(self) -> dict:
        return self.model_dump(exclude_unset=True, exclude=_NOT_WRITABLE)


# --- Requirements (Member 2) --------------------------------------------------


class RequirementCreate(StrictInput):
    organization_id: UuidStr
    material_family: MaterialFamily
    material_specification: MaterialSpecification
    length_mm: Mm | None = None
    width_mm: Mm | None = None
    thickness_mm: Mm | None = None
    length_min_mm: Mm | None = None
    length_max_mm: Mm | None = None
    width_min_mm: Mm | None = None
    width_max_mm: Mm | None = None
    thickness_min_mm: Mm | None = None
    thickness_max_mm: Mm | None = None
    required_quantity: Pieces
    quantity_unit: QuantityUnit = "PIECE"
    maximum_budget_bdt: Bdt | None = None
    allow_split_suppliers: bool = True
    condition_requirement: ConditionRequirement = "ANY"
    status: RequirementStatus = "OPEN"

    @model_validator(mode="after")
    def _spec(self) -> Self:
        _check_spec(self.material_family, self.material_specification)
        return self

    @model_validator(mode="after")
    def _dimension_ranges(self) -> Self:
        for name in ("length", "width", "thickness"):
            minimum = getattr(self, f"{name}_min_mm")
            maximum = getattr(self, f"{name}_max_mm")
            exact = getattr(self, f"{name}_mm")
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(f"{name.capitalize()} minimum cannot exceed maximum")
            if maximum is not None and minimum is None:
                raise ValueError(f"{name.capitalize()} minimum is required when a range maximum is provided")
            if exact is not None and (minimum is not None or maximum is not None):
                raise ValueError(f"{name.capitalize()} exact value cannot be combined with range values")
        return self


class RequirementUpdate(StrictInput):
    material_family: MaterialFamily | None = None
    material_specification: MaterialSpecification | None = None
    length_mm: Mm | None = None
    width_mm: Mm | None = None
    thickness_mm: Mm | None = None
    length_min_mm: Mm | None = None
    length_max_mm: Mm | None = None
    width_min_mm: Mm | None = None
    width_max_mm: Mm | None = None
    thickness_min_mm: Mm | None = None
    thickness_max_mm: Mm | None = None
    required_quantity: Pieces | None = None
    maximum_budget_bdt: Bdt | None = None
    allow_split_suppliers: bool | None = None
    condition_requirement: ConditionRequirement | None = None
    status: RequirementStatus | None = None
    organization_id: UuidStr | None = Field(default=None, description="Must equal the current owner.")
    quantity_unit: QuantityUnit | None = None
    caller_organization_id: UuidStr | None = None

    @model_validator(mode="after")
    def _spec(self) -> Self:
        _check_spec(self.material_family, self.material_specification)
        return self

    @model_validator(mode="after")
    def _dimension_ranges(self) -> Self:
        for name in ("length", "width", "thickness"):
            minimum = getattr(self, f"{name}_min_mm")
            maximum = getattr(self, f"{name}_max_mm")
            exact = getattr(self, f"{name}_mm")
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(f"{name.capitalize()} minimum cannot exceed maximum")
            if maximum is not None and minimum is None:
                raise ValueError(f"{name.capitalize()} minimum is required when a range maximum is provided")
            if exact is not None and (minimum is not None or maximum is not None):
                raise ValueError(f"{name.capitalize()} exact value cannot be combined with range values")
        return self

    def changes(self) -> dict:
        return self.model_dump(exclude_unset=True, exclude=_NOT_WRITABLE)


# --- Exchanges (Member 4) -----------------------------------------------------


class ExchangeCreate(StrictInput):
    requirement_id: UuidStr | None = None
    buyer_organization_id: UuidStr
    listing_id: UuidStr | None = None
    quantity: Pieces | None = None


class ExchangeAction(StrictInput):
    exchange_item_id: UuidStr | None = None
    actor_organization_id: UuidStr | None = None


# --- AI extraction (Member 1) -------------------------------------------------


class ExtractMaterialRequest(StrictInput):
    prompt: Annotated[str, StringConstraints(min_length=5, max_length=2000)]
    mock: bool | None = None


class ExtractRequirementRequest(StrictInput):
    prompt: Annotated[str, StringConstraints(min_length=5, max_length=2000)]
    mock: bool | None = None

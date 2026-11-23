"""SQLAlchemy Core table definitions for the schema owned by supabase/migrations/ (the single
source of truth; this file only describes it, it never creates or alters tables)."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, Computed, DateTime, Integer, MetaData, Numeric, Table, Text, Uuid

metadata = MetaData()

ID = Uuid(as_uuid=False)  # UUIDs as plain strings, like the JSON contract
NUM = Numeric(asdecimal=False)  # NUMERIC as float, no Decimal juggling
TS = DateTime(timezone=True)

organizations = Table(
    "organizations", metadata,
    Column("id", ID, primary_key=True),
    Column("name", Text, nullable=False),
    Column("organization_type", Text, nullable=False),
    Column("city", Text, nullable=False),
    Column("address", Text),
    Column("created_at", TS),
)

listings = Table(
    "listings", metadata,
    Column("id", ID, primary_key=True),
    Column("organization_id", ID, nullable=False),
    Column("material_family", Text, nullable=False),
    Column("material_specification", Text, nullable=False),
    Column("length_mm", NUM, nullable=False),
    Column("width_mm", NUM, nullable=False),
    Column("thickness_mm", NUM, nullable=False),
    Column("total_quantity", Integer, nullable=False),
    Column("reserved_quantity", Integer, nullable=False),
    Column("available_quantity", Integer, Computed("total_quantity - reserved_quantity")),
    Column("quantity_unit", Text, nullable=False),
    Column("condition", Text, nullable=False),
    Column("unit_price_bdt", NUM, nullable=False),
    Column("description", Text),
    Column("image_url", Text),
    Column("city", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("created_at", TS),
    Column("updated_at", TS),
)

requirements = Table(
    "requirements", metadata,
    Column("id", ID, primary_key=True),
    Column("organization_id", ID, nullable=False),
    Column("material_family", Text, nullable=False),
    Column("material_specification", Text, nullable=False),
    Column("length_mm", NUM, nullable=False),
    Column("width_mm", NUM, nullable=False),
    Column("thickness_mm", NUM, nullable=False),
    Column("required_quantity", Integer, nullable=False),
    Column("quantity_unit", Text, nullable=False),
    Column("maximum_budget_bdt", NUM),
    Column("allow_split_suppliers", Boolean, nullable=False),
    Column("condition_requirement", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("created_at", TS),
)

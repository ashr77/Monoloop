-- Member 2: optional exact dimensions and additive acceptable dimension ranges.
-- Existing exact-value requirements remain valid and unchanged.

ALTER TABLE requirements
    ALTER COLUMN length_mm DROP NOT NULL,
    ALTER COLUMN width_mm DROP NOT NULL,
    ALTER COLUMN thickness_mm DROP NOT NULL;

ALTER TABLE requirements
    ADD COLUMN IF NOT EXISTS length_min_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS length_max_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS width_min_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS width_max_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS thickness_min_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS thickness_max_mm NUMERIC;

ALTER TABLE requirements
    ADD CONSTRAINT requirements_length_exact_positive CHECK (length_mm IS NULL OR length_mm > 0),
    ADD CONSTRAINT requirements_width_exact_positive CHECK (width_mm IS NULL OR width_mm > 0),
    ADD CONSTRAINT requirements_thickness_exact_positive CHECK (thickness_mm IS NULL OR thickness_mm > 0),
    ADD CONSTRAINT requirements_length_range_positive CHECK (length_min_mm IS NULL OR length_min_mm > 0),
    ADD CONSTRAINT requirements_length_max_positive CHECK (length_max_mm IS NULL OR length_max_mm > 0),
    ADD CONSTRAINT requirements_length_max_requires_min CHECK (length_max_mm IS NULL OR length_min_mm IS NOT NULL),
    ADD CONSTRAINT requirements_length_range_order CHECK (length_min_mm IS NULL OR length_max_mm IS NULL OR length_min_mm <= length_max_mm),
    ADD CONSTRAINT requirements_width_range_positive CHECK (width_min_mm IS NULL OR width_min_mm > 0),
    ADD CONSTRAINT requirements_width_max_positive CHECK (width_max_mm IS NULL OR width_max_mm > 0),
    ADD CONSTRAINT requirements_width_max_requires_min CHECK (width_max_mm IS NULL OR width_min_mm IS NOT NULL),
    ADD CONSTRAINT requirements_width_range_order CHECK (width_min_mm IS NULL OR width_max_mm IS NULL OR width_min_mm <= width_max_mm),
    ADD CONSTRAINT requirements_thickness_range_positive CHECK (thickness_min_mm IS NULL OR thickness_min_mm > 0),
    ADD CONSTRAINT requirements_thickness_max_positive CHECK (thickness_max_mm IS NULL OR thickness_max_mm > 0),
    ADD CONSTRAINT requirements_thickness_max_requires_min CHECK (thickness_max_mm IS NULL OR thickness_min_mm IS NOT NULL),
    ADD CONSTRAINT requirements_thickness_range_order CHECK (thickness_min_mm IS NULL OR thickness_max_mm IS NULL OR thickness_min_mm <= thickness_max_mm),
    ADD CONSTRAINT requirements_length_exact_excludes_range CHECK (length_mm IS NULL OR (length_min_mm IS NULL AND length_max_mm IS NULL)),
    ADD CONSTRAINT requirements_width_exact_excludes_range CHECK (width_mm IS NULL OR (width_min_mm IS NULL AND width_max_mm IS NULL)),
    ADD CONSTRAINT requirements_thickness_exact_excludes_range CHECK (thickness_mm IS NULL OR (thickness_min_mm IS NULL AND thickness_max_mm IS NULL));

-- 178_vertical_support.sql
-- Adds vertical column to organizations for DealerWyze / RealtyWyze brand split.
-- All existing orgs default to 'dealer' — zero breaking change to live DealerWyze tenants.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'dealer'
  CHECK (vertical IN ('dealer', 'real_estate'));

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS vertical_labels JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_organizations_vertical
  ON organizations(vertical);

COMMENT ON COLUMN organizations.vertical IS
  'Product vertical: dealer (DealerWyze) | real_estate (RealtyWyze). Set at signup from request hostname. Immutable after org creation.';

COMMENT ON COLUMN org_settings.vertical_labels IS
  'Optional per-org label overrides for the vertical vocabulary layer. Merges with vertical config defaults.';

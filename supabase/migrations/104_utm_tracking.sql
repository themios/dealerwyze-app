-- Migration 104: UTM attribution columns on organizations
-- Stores first-touch UTM params captured from paid ad landing pages.
-- All nullable — most orgs arrive via direct/organic and will have NULLs.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term     TEXT,
  ADD COLUMN IF NOT EXISTS utm_content  TEXT;

-- Index on source + campaign for ad performance reporting queries
CREATE INDEX IF NOT EXISTS idx_orgs_utm_source_campaign
  ON organizations(utm_source, utm_campaign)
  WHERE utm_source IS NOT NULL;

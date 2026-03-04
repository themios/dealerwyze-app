-- ============================================================
-- 035_dealerwyze_saas.sql
-- DealerWyze SaaS transition — schema additions
-- Apply in Supabase dashboard SQL editor
-- ============================================================

-- 1. Add slug to organizations (for public inventory feed URLs)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Set Tim's slug
UPDATE organizations
  SET slug = 'apollo-auto'
  WHERE id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations (slug);

-- 2. Extend org_settings with missing per-org fields
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS owner_name          TEXT,
  ADD COLUMN IF NOT EXISTS city                TEXT,
  ADD COLUMN IF NOT EXISTS state               TEXT DEFAULT 'CA',
  ADD COLUMN IF NOT EXISTS zip_code            TEXT,
  ADD COLUMN IF NOT EXISTS locations           JSONB,
  ADD COLUMN IF NOT EXISTS gbp_location_id     TEXT,
  ADD COLUMN IF NOT EXISTS gbp_account_id      TEXT,
  ADD COLUMN IF NOT EXISTS dealer_website_url  TEXT,
  ADD COLUMN IF NOT EXISTS dealer_website_inventory_path TEXT DEFAULT '/cars-for-sale',
  ADD COLUMN IF NOT EXISTS resend_from_domain  TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_out_message TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_in_message  TEXT;

-- 3. Per-org Google OAuth tokens
CREATE TABLE IF NOT EXISTS org_google_tokens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calendar_refresh_token   TEXT,
  token_expires_at         TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

ALTER TABLE org_google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_google_tokens_owner"
  ON org_google_tokens
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));

-- Index for GBP polling cron
CREATE INDEX IF NOT EXISTS idx_org_settings_gbp
  ON org_settings (org_id)
  WHERE gbp_location_id IS NOT NULL;

-- Index for inventory sync cron
CREATE INDEX IF NOT EXISTS idx_org_settings_website
  ON org_settings (org_id)
  WHERE dealer_website_url IS NOT NULL;

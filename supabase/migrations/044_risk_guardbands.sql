-- 044_risk_guardbands.sql
-- Risk guardbands: autofill config, feed tokens, churn detection,
-- quota soft-notification tracking, device fingerprint placeholder.
-- Apply manually in Supabase SQL editor.

-- ── 1. Org Settings: autofill + feed token ───────────────────────────────────

ALTER TABLE org_settings
  -- Overage autofill: dealer pre-approves $20 top-ups when quota is hit
  ADD COLUMN IF NOT EXISTS autofill_enabled        BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autofill_approved_at    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS autofill_approved_via   TEXT        NULL,   -- 'email' | 'sms' | 'voice'
  ADD COLUMN IF NOT EXISTS autofill_amount_cents   INT         NOT NULL DEFAULT 2000, -- $20
  -- Secure inventory feed token (rotatable)
  ADD COLUMN IF NOT EXISTS feed_token              TEXT        NULL;

-- Backfill feed_token for existing orgs (random hex)
UPDATE org_settings
SET feed_token = encode(gen_random_bytes(16), 'hex')
WHERE feed_token IS NULL;

-- ── 2. Organizations: quota notification + churn detection ───────────────────

ALTER TABLE organizations
  -- Track last time 80% quota notification was sent (prevents repeated emails)
  ADD COLUMN IF NOT EXISTS quota_soft_notified_at  TIMESTAMPTZ NULL,
  -- Churn / re-signup detection
  ADD COLUMN IF NOT EXISTS signup_email_domain     TEXT        NULL,
  ADD COLUMN IF NOT EXISTS signup_phone_normalized TEXT        NULL,
  -- Device fingerprint (stored on first login, retained 12mo post-cancel)
  ADD COLUMN IF NOT EXISTS signup_fingerprint      TEXT        NULL,
  -- Flag: this org was flagged as a potential re-signup abuser
  ADD COLUMN IF NOT EXISTS churn_risk_flagged      BOOLEAN     NOT NULL DEFAULT false;

-- Index for fast churn detection lookups on signup
CREATE INDEX IF NOT EXISTS idx_orgs_email_domain
  ON organizations (signup_email_domain)
  WHERE signup_email_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_phone_normalized
  ON organizations (signup_phone_normalized)
  WHERE signup_phone_normalized IS NOT NULL;

-- ── 3. abuse_flags table — consolidated abuse event log ─────────────────────

CREATE TABLE IF NOT EXISTS abuse_flags (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_type    TEXT        NOT NULL,
    -- 'bulk_export' | 'churn_reregister' | 'quota_abuse' | 'feed_scrape'
    -- 'multi_org_duplicate' | 'trial_abuse'
  severity     TEXT        NOT NULL DEFAULT 'medium',
    -- 'critical' | 'high' | 'medium' | 'low'
  details      JSONB       NULL,   -- context: IP, endpoint, count, etc.
  resolved_at  TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abuse_flags_org
  ON abuse_flags (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_flags_open
  ON abuse_flags (created_at DESC)
  WHERE resolved_at IS NULL;

-- Migration 105: account lifecycle tracking columns
-- Supports: 30-day trial, 7-day grace period, free tier downgrade,
--           90-day deletion pipeline, and account suspension.
-- Apply manually in Supabase SQL editor.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS past_due_since         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_tier_since        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_warnings     TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Index for lifecycle cron daily scan (only scans non-canceled orgs)
CREATE INDEX IF NOT EXISTS idx_orgs_lifecycle_scan
  ON organizations (subscription_status, trial_ends_at, past_due_since, free_tier_since)
  WHERE subscription_status IN ('trialing', 'past_due', 'active');

-- Helper RPC: append a warning key to lifecycle_warnings without duplicates
-- Used by accountLifecycle cron to track which emails have been sent.
CREATE OR REPLACE FUNCTION append_lifecycle_warning(org_id UUID, warning TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET lifecycle_warnings = array_append(
    COALESCE(lifecycle_warnings, ARRAY[]::TEXT[]),
    warning
  )
  WHERE id = org_id
    AND NOT (COALESCE(lifecycle_warnings, ARRAY[]::TEXT[]) @> ARRAY[warning]);
$$;

COMMENT ON COLUMN organizations.trial_ends_at
  IS '30-day trial expiry. Set from Stripe trial_end on subscription.created webhook.';
COMMENT ON COLUMN organizations.past_due_since
  IS 'When subscription first went past_due. Set by Stripe webhook; cleared on payment success.';
COMMENT ON COLUMN organizations.free_tier_since
  IS 'When org was downgraded to free tier (plan=free). NULL for paying orgs.';
COMMENT ON COLUMN organizations.suspended_at
  IS 'When org was suspended by admin. NULL = active. Non-null blocks all API access.';
COMMENT ON COLUMN organizations.deletion_scheduled_at
  IS 'Computed: free_tier_since + 90 days. Data deleted after this date by data-retention cron.';
COMMENT ON COLUMN organizations.lifecycle_warnings
  IS 'Warning keys already sent: {grace_day1, grace_day7, free_day30, free_day60, free_day75, free_day83}. Prevents duplicate emails.';

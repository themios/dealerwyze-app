-- Migration 045: Security caps — security_events table, voice caps, autofill topup counters
-- Apply in Supabase SQL Editor.

-- ── security_events: structured log of signature failures, rate-limit triggers, anomalies ─────
CREATE TABLE IF NOT EXISTS security_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT        NOT NULL,  -- 'sig_failure' | 'rate_limit' | 'bulk_export' | 'caller_abuse'
  ip          TEXT        NULL,
  org_id      UUID        NULL REFERENCES organizations(id) ON DELETE SET NULL,
  details     JSONB       NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_org  ON security_events (org_id, created_at DESC);

-- SuperAdmin reads only
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "superadmin_all_security_events" ON security_events;
CREATE POLICY "superadmin_all_security_events" ON security_events
  FOR ALL USING (get_org_id() = '00000000-0000-0000-0000-000000000001');

-- Service role can insert (used by webhook routes, cron)
DROP POLICY IF EXISTS "service_insert_security_events" ON security_events;
CREATE POLICY "service_insert_security_events" ON security_events
  FOR INSERT WITH CHECK (true);

-- ── Voice caps on org_settings ───────────────────────────────────────────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS voice_enabled       BOOLEAN NOT NULL DEFAULT true,
  -- Monthly voice usage in seconds (reset each billing cycle by cron)
  ADD COLUMN IF NOT EXISTS voice_minutes_month INT     NOT NULL DEFAULT 0,
  -- Hard cap in seconds; 60000 = 1,000 minutes/month
  ADD COLUMN IF NOT EXISTS voice_minutes_cap   INT     NOT NULL DEFAULT 60000;

-- ── Autofill topup counters ───────────────────────────────────────────────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS autofill_topups_today  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS autofill_topups_month  SMALLINT NOT NULL DEFAULT 0;

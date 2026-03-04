-- 041_admin_alerts.sql
-- World-class admin panel infrastructure:
--   1. admin_alerts — proactive churn / health warnings surfaced to SuperAdmin
--   2. cron_runs    — cron job health monitoring
--   3. organizations.suspended_at / suspension_reason — ToS enforcement
--   4. support_tickets.first_staff_response_at / sla_breach_at — SLA tracking

-- ── 1. Admin Alerts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type  TEXT        NOT NULL,
    -- 'trial_expiring' | 'no_activity' | 'past_due' | 'no_email'
  severity    TEXT        NOT NULL DEFAULT 'warning',
    -- 'critical' | 'warning' | 'info'
  resolved_at TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_alerts_unique_open
    UNIQUE NULLS NOT DISTINCT (org_id, alert_type, resolved_at)
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_open
  ON admin_alerts (created_at DESC)
  WHERE resolved_at IS NULL;

-- ── 2. Cron Runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cron_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name        TEXT        NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ NULL,
  status          TEXT        NOT NULL DEFAULT 'running',
    -- 'running' | 'success' | 'error'
  orgs_processed  INT         NULL,
  error_msg       TEXT        NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job
  ON cron_runs (job_name, started_at DESC);

-- ── 3. Organization Suspension ───────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS suspended_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason  TEXT        NULL;

-- ── 4. Support Ticket SLA ────────────────────────────────────────────────────

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS first_staff_response_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sla_breach_at           TIMESTAMPTZ NULL;

-- Backfill sla_breach_at for existing open/in_progress tickets
-- urgent=2h, high=8h, normal=24h, low=72h
UPDATE support_tickets
SET sla_breach_at = CASE priority
  WHEN 'urgent' THEN created_at + INTERVAL '2 hours'
  WHEN 'high'   THEN created_at + INTERVAL '8 hours'
  WHEN 'normal' THEN created_at + INTERVAL '24 hours'
  WHEN 'low'    THEN created_at + INTERVAL '72 hours'
  ELSE                created_at + INTERVAL '24 hours'
END
WHERE sla_breach_at IS NULL
  AND status IN ('open', 'in_progress');

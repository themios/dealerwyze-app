-- 164_platform_email_log.sql
-- Records every system-to-dealer email so the admin panel can show a full comms history.

CREATE TABLE IF NOT EXISTS platform_email_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  to_email   TEXT        NOT NULL,
  subject    TEXT        NOT NULL,
  email_type TEXT        NOT NULL DEFAULT 'unknown',
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_email_log_org
  ON platform_email_log (org_id, sent_at DESC);

-- Backfill from admin_alerts dedup markers so existing orgs have history
INSERT INTO platform_email_log (org_id, to_email, subject, email_type, sent_at)
SELECT
  org_id,
  '' AS to_email,
  CASE alert_type
    WHEN 'dealer_followup_d1'  THEN '3 things to do first in DealerWyze'
    WHEN 'dealer_followup_d3'  THEN 'How is setup going?'
    WHEN 'dealer_followup_d7'  THEN 'Still here for you'
    WHEN 'onboarding_nudge'    THEN 'Action needed: finish your DealerWyze setup'
    ELSE alert_type
  END AS subject,
  alert_type AS email_type,
  created_at AS sent_at
FROM admin_alerts
WHERE alert_type IN ('dealer_followup_d1', 'dealer_followup_d3', 'dealer_followup_d7', 'onboarding_nudge')
  AND org_id != '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

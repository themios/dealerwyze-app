-- Append-only log of all recovery actions (restore + purge) for audit compliance
CREATE TABLE IF NOT EXISTS org_data_recovery_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_at  timestamptz NOT NULL DEFAULT now(),
  performed_by  uuid NOT NULL,   -- platform admin profile id
  action        text NOT NULL CHECK (action IN ('restore', 'purge', 'expire')),
  table_name    text NOT NULL,   -- 'customers' | 'activities' | 'vehicles' | 'ledger_transactions'
  recovery_id   uuid NOT NULL,   -- the deleted_* table row
  original_id   uuid NOT NULL,
  org_id        uuid NOT NULL,
  metadata      jsonb
);

CREATE INDEX IF NOT EXISTS idx_recovery_log_org ON org_data_recovery_log(org_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_log_by ON org_data_recovery_log(performed_by, performed_at DESC);

ALTER TABLE org_data_recovery_log ENABLE ROW LEVEL SECURITY;
-- No authenticated-role policies = deny all. Service role only.


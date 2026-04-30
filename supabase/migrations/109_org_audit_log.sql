-- Migration 109: Org-level audit log for security-sensitive events.
-- Records impersonation, payment state changes, data exports, settings mutations,
-- and webhook auth failures — all scoped to the org they affect.
--
-- org_id is nullable: system/webhook events where org context is unknown use NULL.
-- ON DELETE SET NULL: org deletion preserves audit trail (compliance requirement).

CREATE TABLE IF NOT EXISTS org_audit_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type  TEXT        NOT NULL CHECK (actor_type IN ('user', 'staff', 'system', 'webhook')),
  action      TEXT        NOT NULL,
  details     JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_audit_org     ON org_audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_audit_action  ON org_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_audit_actor   ON org_audit_log (actor_id, created_at DESC);

-- RLS: platform superadmins can read all rows; org admins/managers can read their org's rows.
-- Audit integrity: no tenant can insert or modify rows (service role only for writes).
ALTER TABLE org_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_read_audit"
  ON org_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_superusers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_admin_read_own_audit"
  ON org_audit_log
  FOR SELECT
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id = org_audit_log.org_id
        AND role IN ('dealer_admin', 'dealer_manager')
    )
  );

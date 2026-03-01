-- Admin audit log — records all admin-initiated actions on orgs
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action        TEXT NOT NULL,
  target_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org     ON admin_audit_log(target_org_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin   ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);

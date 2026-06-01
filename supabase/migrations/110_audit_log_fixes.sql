-- Migration 110: Idempotent fixup for org_audit_log if migration 109 was applied
-- with the wrong ON DELETE CASCADE or the broken platform_admins RLS policy.
--
-- Safe to run even if 109 was already applied correctly — all statements are conditional.

-- Fix FK: if it exists with CASCADE, drop and recreate with SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_name = 'org_audit_log_org_id_fkey'
      AND delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE org_audit_log DROP CONSTRAINT org_audit_log_org_id_fkey;
    ALTER TABLE org_audit_log
      ADD CONSTRAINT org_audit_log_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Fix broken RLS policy that referenced nonexistent platform_admins table
DROP POLICY IF EXISTS "platform_admin_read_audit" ON org_audit_log;

DROP POLICY IF EXISTS "platform_admin_read_audit" ON org_audit_log;
CREATE POLICY "platform_admin_read_audit" ON org_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_superusers WHERE user_id = auth.uid()
    )
  );

-- Add org-admin read policy (drop first so this is idempotent)
DROP POLICY IF EXISTS "org_admin_read_own_audit" ON org_audit_log;

DROP POLICY IF EXISTS "org_admin_read_own_audit" ON org_audit_log;
CREATE POLICY "org_admin_read_own_audit" ON org_audit_log
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

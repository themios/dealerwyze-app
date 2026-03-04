-- ============================================================
-- 037_platform_identity.sql
-- Platform super-admin layer: platform_superusers table + seed Tim
-- ============================================================

-- Platform super admins (DealerWyze platform operators)
-- These users can access /admin and all tenant data
CREATE TABLE IF NOT EXISTS platform_superusers (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only service role can read/write — deny all user-level access
ALTER TABLE platform_superusers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_superusers_deny_all" ON platform_superusers FOR ALL
  USING (false);

-- Seed Tim as the first super admin
INSERT INTO platform_superusers (user_id)
VALUES ('db5442d1-e92f-4eb0-8876-6adb1a9a0ccb')
ON CONFLICT (user_id) DO NOTHING;

-- Platform role column on profiles (for platform_staff future support)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS platform_role TEXT
  CHECK (platform_role IN ('platform_staff'));

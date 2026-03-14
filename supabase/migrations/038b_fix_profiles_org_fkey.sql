-- ============================================================
-- 038b_fix_profiles_org_fkey.sql
-- profiles.org_id originally referenced auth.users(id) in the
-- single-tenant design (org_id = owner's user id).
-- For multi-tenant SaaS, org_id must reference organizations(id)
-- so platform staff can use the sentinel org UUID
-- 00000000-0000-0000-0000-000000000001 which is not an auth user.
-- ============================================================

-- Drop old FK to auth.users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_org_id_fkey;

-- Add new FK to organizations (ON DELETE CASCADE matches original behavior)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 021_rls_security.sql
-- Add RLS to tables that were missing policies.
-- organizations and org_settings had no RLS — any authenticated user could read all orgs.
-- profiles table also needs self-only access.

-- ── organizations ─────────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Owner can read/update their own org
DROP POLICY IF EXISTS "org_owner_select" ON organizations;
CREATE POLICY "org_owner_select" ON organizations
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "org_owner_update" ON organizations;
CREATE POLICY "org_owner_update" ON organizations
  FOR UPDATE USING (id = auth.uid());

-- Service role bypass is implicit (SECURITY DEFINER functions + service key skip RLS)

-- ── org_settings ──────────────────────────────────────────────────────────────
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_settings_owner_select" ON org_settings;
CREATE POLICY "org_settings_owner_select" ON org_settings
  FOR SELECT USING (org_id = auth.uid());

DROP POLICY IF EXISTS "org_settings_owner_update" ON org_settings;
CREATE POLICY "org_settings_owner_update" ON org_settings
  FOR UPDATE USING (org_id = auth.uid());

-- ── profiles ──────────────────────────────────────────────────────────────────
-- profiles.org_id = auth.uid() for owner; staff share same org_id
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read profiles in their own org
DROP POLICY IF EXISTS "profiles_same_org_select" ON profiles;
CREATE POLICY "profiles_same_org_select" ON profiles
  FOR SELECT USING (org_id = auth.uid() OR id = auth.uid());

-- Users can only update their own profile
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ── voice_calls ───────────────────────────────────────────────────────────────
-- Ensure voice_calls RLS matches other tables (org_id = auth.uid())
ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_calls_org_select" ON voice_calls;
CREATE POLICY "voice_calls_org_select" ON voice_calls
  FOR SELECT USING (org_id = auth.uid());

DROP POLICY IF EXISTS "voice_calls_org_insert" ON voice_calls;
CREATE POLICY "voice_calls_org_insert" ON voice_calls
  FOR INSERT WITH CHECK (org_id = auth.uid());

DROP POLICY IF EXISTS "voice_calls_org_update" ON voice_calls;
CREATE POLICY "voice_calls_org_update" ON voice_calls
  FOR UPDATE USING (org_id = auth.uid());

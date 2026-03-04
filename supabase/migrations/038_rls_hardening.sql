-- ============================================================
-- 038_rls_hardening.sql
-- Fixes three issues found in 036_fix_agent_rls.sql:
--
-- 1. Recursive RLS on profiles (SELECT inside profiles policy).
--    Fix: public.get_org_id() SECURITY DEFINER function breaks
--    the loop. Uses public schema — auth schema is blocked in
--    Supabase migrations.
--
-- 2. FOR ALL policies lacked WITH CHECK — INSERT could write
--    to any org_id. Fix: add WITH CHECK to every FOR ALL policy.
--
-- 3. organizations + org_settings had no INSERT/DELETE deny
--    policy — direct inserts from client were possible.
--    Fix: explicit deny policies for non-service roles.
--
-- 4. Backfill: platform staff profiles corrected to sentinel org.
--    Requires 038a_sentinel_org.sql applied first.
-- ============================================================

-- ── 1. public.get_org_id() SECURITY DEFINER — eliminates recursion ────────
-- Runs as function owner (postgres), bypasses RLS when querying profiles.
-- SET search_path prevents search-path hijacking.
CREATE OR REPLACE FUNCTION public.get_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ── 2. Rewrite all 036 policies using get_org_id() ───────────────────────

-- customers
DROP POLICY IF EXISTS "org_own_customers" ON customers;
CREATE POLICY "org_own_customers" ON customers FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- vehicles
DROP POLICY IF EXISTS "org_own_vehicles" ON vehicles;
CREATE POLICY "org_own_vehicles" ON vehicles FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- activities
DROP POLICY IF EXISTS "org_own_activities" ON activities;
CREATE POLICY "org_own_activities" ON activities FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- templates
DROP POLICY IF EXISTS "org_own_templates" ON templates;
CREATE POLICY "org_own_templates" ON templates FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- customer_vehicles (no user_id — join through customers)
DROP POLICY IF EXISTS "org_own_customer_vehicles" ON customer_vehicles;
CREATE POLICY "org_own_customer_vehicles" ON customer_vehicles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = customer_id AND c.user_id = get_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = customer_id AND c.user_id = get_org_id()
  ));

-- tasks
DROP POLICY IF EXISTS "org_own_tasks" ON tasks;
CREATE POLICY "org_own_tasks" ON tasks FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- receipts
DROP POLICY IF EXISTS "org_own_receipts" ON receipts;
CREATE POLICY "org_own_receipts" ON receipts FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- ledger_transactions
DROP POLICY IF EXISTS "org_own_ledger" ON ledger_transactions;
CREATE POLICY "org_own_ledger" ON ledger_transactions FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- receipt_categories
DROP POLICY IF EXISTS "org_own_receipt_categories" ON receipt_categories;
CREATE POLICY "org_own_receipt_categories" ON receipt_categories FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- vendor_rules
DROP POLICY IF EXISTS "org_own_vendor_rules" ON vendor_rules;
CREATE POLICY "org_own_vendor_rules" ON vendor_rules FOR ALL
  USING     (user_id = get_org_id())
  WITH CHECK (user_id = get_org_id());

-- dealer_goals (column is org_id, not user_id)
DROP POLICY IF EXISTS "org_own_goals" ON dealer_goals;
CREATE POLICY "org_own_goals" ON dealer_goals FOR ALL
  USING     (org_id = get_org_id())
  WITH CHECK (org_id = get_org_id());

-- briefings (column is org_id, not user_id)
DROP POLICY IF EXISTS "org_own_briefings" ON briefings;
CREATE POLICY "org_own_briefings" ON briefings FOR ALL
  USING     (org_id = get_org_id())
  WITH CHECK (org_id = get_org_id());

-- organizations: member SELECT + admin UPDATE (INSERT/DELETE denied in section 3)
DROP POLICY IF EXISTS "org_member_select" ON organizations;
DROP POLICY IF EXISTS "org_admin_update"  ON organizations;
CREATE POLICY "org_member_select" ON organizations FOR SELECT
  USING (id = get_org_id());
CREATE POLICY "org_admin_update" ON organizations FOR UPDATE
  USING     (id = get_org_id())
  WITH CHECK (id = get_org_id());

-- org_settings: member SELECT + admin UPDATE
DROP POLICY IF EXISTS "org_settings_member_select" ON org_settings;
DROP POLICY IF EXISTS "org_settings_admin_update"  ON org_settings;
CREATE POLICY "org_settings_member_select" ON org_settings FOR SELECT
  USING (org_id = get_org_id());
CREATE POLICY "org_settings_admin_update" ON org_settings FOR UPDATE
  USING     (org_id = get_org_id())
  WITH CHECK (org_id = get_org_id());

-- profiles: fix recursion (was querying profiles inside profiles policy)
DROP POLICY IF EXISTS "profiles_same_org_select" ON profiles;
CREATE POLICY "profiles_same_org_select" ON profiles FOR SELECT
  USING (org_id = get_org_id() OR id = auth.uid());

-- voice_calls
DROP POLICY IF EXISTS "voice_calls_org_select" ON voice_calls;
DROP POLICY IF EXISTS "voice_calls_org_insert" ON voice_calls;
DROP POLICY IF EXISTS "voice_calls_org_update" ON voice_calls;
CREATE POLICY "voice_calls_org_select" ON voice_calls FOR SELECT
  USING (org_id = get_org_id());
CREATE POLICY "voice_calls_org_insert" ON voice_calls FOR INSERT
  WITH CHECK (org_id = get_org_id());
CREATE POLICY "voice_calls_org_update" ON voice_calls FOR UPDATE
  USING     (org_id = get_org_id())
  WITH CHECK (org_id = get_org_id());

-- ── 3. Deny direct INSERT/DELETE on organizations + org_settings ──────────
-- New orgs are created via service client (bypasses RLS). These policies
-- prevent any authenticated client from inserting/deleting orgs directly.

DROP POLICY IF EXISTS "orgs_no_direct_insert" ON organizations;
DROP POLICY IF EXISTS "orgs_no_direct_delete" ON organizations;
CREATE POLICY "orgs_no_direct_insert" ON organizations FOR INSERT WITH CHECK (false);
CREATE POLICY "orgs_no_direct_delete" ON organizations FOR DELETE USING (false);

DROP POLICY IF EXISTS "org_settings_no_direct_insert" ON org_settings;
DROP POLICY IF EXISTS "org_settings_no_direct_delete" ON org_settings;
CREATE POLICY "org_settings_no_direct_insert" ON org_settings FOR INSERT WITH CHECK (false);
CREATE POLICY "org_settings_no_direct_delete" ON org_settings FOR DELETE USING (false);

-- ── 4. Backfill platform staff profiles to sentinel org ───────────────────
-- Requires 038a_sentinel_org.sql to be applied first.
UPDATE profiles
SET org_id = '00000000-0000-0000-0000-000000000001'
WHERE platform_role = 'platform_staff';

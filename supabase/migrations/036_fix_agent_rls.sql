-- ============================================================
-- 036_fix_agent_rls.sql
-- Fix RLS so org agents (auth.uid() ≠ org_id) can access their
-- org's data.  All policies now resolve org via profiles.org_id.
-- Idempotent: drops both old and new policy names before creating.
-- ============================================================

-- ── customers ─────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_customers"  ON customers;
DROP POLICY IF EXISTS "org_own_customers"    ON customers;
CREATE POLICY "org_own_customers" ON customers FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── vehicles ──────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_vehicles"   ON vehicles;
DROP POLICY IF EXISTS "org_own_vehicles"     ON vehicles;
CREATE POLICY "org_own_vehicles" ON vehicles FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── activities ────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_activities" ON activities;
DROP POLICY IF EXISTS "org_own_activities"   ON activities;
CREATE POLICY "org_own_activities" ON activities FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── templates ─────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_templates"  ON templates;
DROP POLICY IF EXISTS "org_own_templates"    ON templates;
CREATE POLICY "org_own_templates" ON templates FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── customer_vehicles ─────────────────────────────────────
DROP POLICY IF EXISTS "users_own_customer_vehicles" ON customer_vehicles;
DROP POLICY IF EXISTS "org_own_customer_vehicles"   ON customer_vehicles;
CREATE POLICY "org_own_customer_vehicles" ON customer_vehicles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = customer_id
      AND c.user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

-- ── tasks ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_tasks"      ON tasks;
DROP POLICY IF EXISTS "org_own_tasks"        ON tasks;
CREATE POLICY "org_own_tasks" ON tasks FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── receipts ──────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_receipts"   ON receipts;
DROP POLICY IF EXISTS "org_own_receipts"     ON receipts;
CREATE POLICY "org_own_receipts" ON receipts FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── ledger_transactions ───────────────────────────────────
DROP POLICY IF EXISTS "users_own_ledger"     ON ledger_transactions;
DROP POLICY IF EXISTS "org_own_ledger"       ON ledger_transactions;
CREATE POLICY "org_own_ledger" ON ledger_transactions FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── receipt_categories ────────────────────────────────────
DROP POLICY IF EXISTS "users_own_receipt_categories" ON receipt_categories;
DROP POLICY IF EXISTS "org_own_receipt_categories"   ON receipt_categories;
CREATE POLICY "org_own_receipt_categories" ON receipt_categories FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── vendor_rules ──────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_vendor_rules" ON vendor_rules;
DROP POLICY IF EXISTS "org_own_vendor_rules"   ON vendor_rules;
CREATE POLICY "org_own_vendor_rules" ON vendor_rules FOR ALL
  USING (user_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── dealer_goals (uses org_id column) ─────────────────────
DROP POLICY IF EXISTS "users_own_goals"      ON dealer_goals;
DROP POLICY IF EXISTS "org_own_goals"        ON dealer_goals;
CREATE POLICY "org_own_goals" ON dealer_goals FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── briefings (uses org_id column) ───────────────────────
DROP POLICY IF EXISTS "users_own_briefings"  ON briefings;
DROP POLICY IF EXISTS "org_own_briefings"    ON briefings;
CREATE POLICY "org_own_briefings" ON briefings FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── organizations — allow agents to read their org ────────
DROP POLICY IF EXISTS "org_owner_select"     ON organizations;
DROP POLICY IF EXISTS "org_owner_update"     ON organizations;
DROP POLICY IF EXISTS "org_member_select"    ON organizations;
DROP POLICY IF EXISTS "org_admin_update"     ON organizations;
CREATE POLICY "org_member_select" ON organizations FOR SELECT
  USING (id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
-- Only owner (whose auth.uid() = org_id) may update
CREATE POLICY "org_admin_update" ON organizations FOR UPDATE
  USING (id = auth.uid());

-- ── org_settings — allow agents to read ──────────────────
DROP POLICY IF EXISTS "org_settings_owner_select"   ON org_settings;
DROP POLICY IF EXISTS "org_settings_owner_update"   ON org_settings;
DROP POLICY IF EXISTS "org_settings_member_select"  ON org_settings;
DROP POLICY IF EXISTS "org_settings_admin_update"   ON org_settings;
CREATE POLICY "org_settings_member_select" ON org_settings FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_settings_admin_update" ON org_settings FOR UPDATE
  USING (org_id = auth.uid());

-- ── profiles — agents can see all profiles in their org ──
DROP POLICY IF EXISTS "profiles_same_org_select" ON profiles;
CREATE POLICY "profiles_same_org_select" ON profiles FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR id = auth.uid());

-- ── voice_calls ───────────────────────────────────────────
DROP POLICY IF EXISTS "voice_calls_org_select" ON voice_calls;
DROP POLICY IF EXISTS "voice_calls_org_insert" ON voice_calls;
DROP POLICY IF EXISTS "voice_calls_org_update" ON voice_calls;
CREATE POLICY "voice_calls_org_select" ON voice_calls FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "voice_calls_org_insert" ON voice_calls FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "voice_calls_org_update" ON voice_calls FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── admin_audit_log — service role only ──────────────────
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_audit_log_deny_all" ON admin_audit_log;
CREATE POLICY "admin_audit_log_deny_all" ON admin_audit_log FOR ALL
  USING (false);

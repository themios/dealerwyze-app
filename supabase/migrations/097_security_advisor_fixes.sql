-- ============================================================
-- Migration 097: Fix Supabase Security Advisor warnings
-- Fixes: RLS missing on 4 tables, mutable search_path on 13
--        functions, overly-permissive security_events INSERT
--        policy, commission_ledger no-policy, leaked password
--        protection (must be enabled manually in Auth dashboard)
-- ============================================================

-- ── 1. Enable RLS on tables missing it ──────────────────────

-- bhph_payment_tokens: contains sensitive `token` column
ALTER TABLE public.bhph_payment_tokens ENABLE ROW LEVEL SECURITY;

-- Org staff can read/manage their own org's payment tokens.
-- The public /pay/[token] route uses service role (bypasses RLS).
DROP POLICY IF EXISTS "org_own_bhph_payment_tokens" ON public.bhph_payment_tokens;
CREATE POLICY "org_own_bhph_payment_tokens" ON public.bhph_payment_tokens
  FOR ALL
  USING (org_id = public.get_org_id());

-- admin_alerts: internal platform table, app always uses service client
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
-- No policy = zero PostgREST access for regular users; service role bypasses RLS

-- cron_runs: internal tracking table, app always uses service client
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
-- No policy = zero PostgREST access for regular users; service role bypasses RLS

-- abuse_flags: security table, app always uses service client
ALTER TABLE public.abuse_flags ENABLE ROW LEVEL SECURITY;
-- No policy = zero PostgREST access for regular users; service role bypasses RLS

-- ── 2. commission_ledger: RLS enabled but no policy ─────────
-- Org staff (admin/manager) can view their own org's ledger.
-- Writes go through service client only.
DROP POLICY IF EXISTS "org_own_commission_ledger" ON public.commission_ledger;
CREATE POLICY "org_own_commission_ledger" ON public.commission_ledger
  FOR SELECT
  USING (org_id = public.get_org_id());

-- ── 3. Tighten security_events INSERT policy ─────────────────
-- Old policy allowed ANY role to insert (WITH CHECK (true)).
-- Replace with: only the authenticated user can insert their own events.
DROP POLICY IF EXISTS "service_insert_security_events" ON public.security_events;

DROP POLICY IF EXISTS "authenticated_insert_security_events" ON public.security_events;
CREATE POLICY "authenticated_insert_security_events" ON public.security_events
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ── 4. Fix mutable search_path on all flagged functions ──────
-- Prevents search_path hijacking attacks. Sets search_path to
-- empty string so all references must be schema-qualified.

ALTER FUNCTION public.generate_invite_code()
  SET search_path = '';

ALTER FUNCTION public.create_org_on_signup()
  SET search_path = '';

ALTER FUNCTION public.increment_sms_usage(UUID, BOOLEAN)
  SET search_path = '';

ALTER FUNCTION public.increment_voice_usage(UUID, INTEGER)
  SET search_path = '';

ALTER FUNCTION public.increment_engagement_score(UUID)
  SET search_path = '';

ALTER FUNCTION public.increment_org_scan_counter(UUID, BOOLEAN)
  SET search_path = '';

ALTER FUNCTION public.get_org_subscription_status(UUID)
  SET search_path = '';

ALTER FUNCTION public.enforce_free_tier_customer_cap()
  SET search_path = '';

ALTER FUNCTION public.enforce_free_tier_vehicle_cap()
  SET search_path = '';

ALTER FUNCTION public.trg_append_price_history()
  SET search_path = '';

ALTER FUNCTION public.increment_vehicle_views(UUID)
  SET search_path = '';

ALTER FUNCTION public.update_vehicle_wants_updated_at()
  SET search_path = '';

-- advance_lead_state has been redefined across multiple migrations.
-- Use the final signature from 087_pipeline_stages.sql.
ALTER FUNCTION public.advance_lead_state(UUID, TEXT, TEXT)
  SET search_path = '';

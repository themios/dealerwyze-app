-- Migration 221: Revoke anon EXECUTE on internal SECURITY DEFINER functions
-- Supabase Security Advisor: anon_security_definer_function_executable
--
-- Supabase auto-grants EXECUTE to anon/authenticated on new functions; REVOKE FROM
-- PUBLIC alone is insufficient. This migration explicitly revokes anon (and
-- authenticated where service-only) then re-grants least privilege.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PUBLIC RPC — keep anon (validates published = true inside function body)
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.increment_vehicle_views(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_vehicle_views(uuid) TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS / policy helpers — authenticated + service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.get_org_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_org_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_platform_superuser() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_superuser() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Free-tier triggers — authenticated + service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.get_org_subscription_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_org_subscription_status(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_free_tier_customer_cap() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforce_free_tier_customer_cap() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_free_tier_vehicle_cap() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforce_free_tier_vehicle_cap() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Staff RPCs — authenticated + service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.advance_lead_state(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_lead_state(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_bhph_manual_payment(uuid, numeric, date, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_bhph_manual_payment(uuid, numeric, date, text, text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.close_re_transaction(uuid, uuid, numeric, date, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_re_transaction(uuid, uuid, numeric, date, uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger functions — authenticated + service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.auto_set_org_user_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_set_org_user_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_org_on_signup() FROM anon;
GRANT EXECUTE ON FUNCTION public.create_org_on_signup() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_activity_created_by() FROM anon;
GRANT EXECUTE ON FUNCTION public.set_activity_created_by() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.stamp_customer_first_response() FROM anon;
GRANT EXECUTE ON FUNCTION public.stamp_customer_first_response() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.complete_lead_tasks_on_response() FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_lead_tasks_on_response() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.trg_append_price_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.trg_append_price_history() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.archive_deleted_customer() FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_deleted_customer() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.archive_deleted_activity() FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_deleted_activity() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.archive_deleted_vehicle() FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_deleted_vehicle() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.archive_deleted_ledger_transaction() FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_deleted_ledger_transaction() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.sync_listing_showing_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_listing_showing_count() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_dealer_thread_ts() FROM anon;
GRANT EXECUTE ON FUNCTION public.update_dealer_thread_ts() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_vehicle_wants_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION public.update_vehicle_wants_updated_at() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.normalize_phone(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Internal helpers — service_role ONLY
-- ═══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.bhph_payment_allocation(numeric, date, numeric, numeric, date, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bhph_payment_allocation(numeric, date, numeric, numeric, date, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_twilio_message_sid(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_twilio_message_sid(text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_overage_buffer(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_overage_buffer(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.deduct_overage_buffer(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_overage_buffer(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.append_lifecycle_warning(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_lifecycle_warning(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_sms_usage(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_sms_usage(uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_voice_usage(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_voice_usage(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_sms_overage(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_sms_overage(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_mms_overage(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_mms_overage(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_fax_pages(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_fax_pages(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reset_overage_counters(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_overage_counters(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_org_scan_counter(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_org_scan_counter(uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_engagement_score(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_engagement_score(uuid) TO service_role;

-- BHPH finalization — service_role via /api/pay + Stripe (validates token internally; not anon RPC)
REVOKE EXECUTE ON FUNCTION public.finalize_bhph_payment(uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bhph_payment(uuid, text, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_bhph_payment(uuid, text, timestamptz, numeric, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bhph_payment(uuid, text, timestamptz, numeric, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_bhph_payment_v1(uuid, text, timestamptz, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bhph_payment_v1(uuid, text, timestamptz, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_bhph_sale_with_deferred(
  uuid, uuid, uuid, numeric, text, text, numeric, numeric, numeric, numeric, text, integer, date,
  text, boolean, timestamptz, text, text, boolean, timestamptz, text, jsonb
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bhph_sale_with_deferred(
  uuid, uuid, uuid, numeric, text, text, numeric, numeric, numeric, numeric, text, integer, date,
  text, boolean, timestamptz, text, text, boolean, timestamptz, text, jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_bhph_sale_with_deferred(
  uuid, uuid, uuid, numeric, text, text, numeric, numeric, numeric, numeric, text, integer, date,
  text, boolean, timestamptz, text, text, boolean, timestamptz, text, jsonb, numeric
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bhph_sale_with_deferred(
  uuid, uuid, uuid, numeric, text, text, numeric, numeric, numeric, numeric, text, integer, date,
  text, boolean, timestamptz, text, text, boolean, timestamptz, text, jsonb, numeric
) TO service_role;

-- Catch-all: revoke anon on any remaining public SECURITY DEFINER functions except public VDP counter
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true
      AND p.proname <> 'increment_vehicle_views'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

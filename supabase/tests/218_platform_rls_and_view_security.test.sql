-- Verification queries for migration 218_platform_rls_and_view_security.sql
-- Run after applying migration: psql "$SUPABASE_DB_URL" -f supabase/tests/218_platform_rls_and_view_security.test.sql

\echo '=== Views: security_invoker enabled ==='
SELECT c.relname AS view_name,
       COALESCE(
         (SELECT option_value FROM unnest(c.reloptions) AS option_value WHERE option_value LIKE 'security_invoker=%'),
         'MISSING'
       ) AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN (
    'v_rep_ghost_rates',
    'v_sequence_step_dropoff',
    'v_rep_conversion_funnel',
    'v_rep_response_times',
    'v_rep_reply_rates'
  )
ORDER BY c.relname;

\echo '=== Platform tables: RLS enabled + policy counts ==='
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'platform_feature_flags',
    'platform_notification_config',
    'webhook_idempotency',
    'platform_social_accounts',
    'platform_connector_config',
    'platform_content_config',
    'platform_plan_quotas',
    'platform_settings'
  )
ORDER BY c.relname;

\echo '=== is_platform_superuser() exists ==='
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'is_platform_superuser'
  AND pronamespace = 'public'::regnamespace;

\echo '=== Sample read: platform_settings (service role / migration runner) ==='
SELECT count(*) AS platform_settings_rows FROM public.platform_settings;

\echo '=== Sample read: v_rep_response_times (service role) ==='
SELECT count(*) AS response_time_rows FROM public.v_rep_response_times;

\echo '=== PASS if all views show security_invoker=true and each table has policy_count >= 4 ==='

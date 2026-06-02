-- Migration 218: Platform table RLS policies + remove SECURITY DEFINER behavior from rep analytics views
-- Supabase security audit: 8 platform tables had RLS enabled without policies;
-- 5 rep analytics views ran with owner privileges (default view behavior).

-- ── 1. Helper: platform superuser check (bypasses platform_superusers deny-all RLS) ──

CREATE OR REPLACE FUNCTION public.is_platform_superuser()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_superusers
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_superuser() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_superuser() TO authenticated, service_role;

-- ── 2. Rep analytics views: recreate with security_invoker (caller RLS applies) ──

CREATE OR REPLACE VIEW public.v_rep_response_times
WITH (security_invoker = true) AS
WITH inbound_leads AS (
  SELECT
    a.user_id AS org_id,
    c.assigned_to AS assigned_rep_id,
    a.customer_id,
    a.id AS activity_id,
    a.created_at AS lead_created_at,
    (
      SELECT MIN(o.created_at)
      FROM public.activities o
      WHERE o.user_id = a.user_id
        AND o.customer_id = a.customer_id
        AND o.direction = 'outbound'
        AND o.created_by IS NOT NULL
        AND o.created_at >= a.created_at
    ) AS first_outbound_at
  FROM public.activities a
  JOIN public.customers c
    ON c.id = a.customer_id
   AND c.user_id = a.user_id
  WHERE a.direction = 'inbound'
    AND a.customer_id IS NOT NULL
    AND c.assigned_to IS NOT NULL
    AND a.type IN ('email', 'sms', 'appointment', 'web_lead', 'vehicle_match')
)
SELECT
  org_id,
  assigned_rep_id,
  customer_id,
  activity_id,
  lead_created_at,
  first_outbound_at,
  ROUND(EXTRACT(EPOCH FROM (first_outbound_at - lead_created_at)) / 60.0, 2) AS first_response_minutes
FROM inbound_leads
WHERE first_outbound_at IS NOT NULL;

CREATE OR REPLACE VIEW public.v_rep_reply_rates
WITH (security_invoker = true) AS
SELECT
  o.user_id AS org_id,
  c.assigned_to AS assigned_rep_id,
  o.customer_id,
  o.id AS outbound_activity_id,
  o.created_at AS outbound_at,
  CASE
    WHEN o.type IN ('sms', 'sms_followup') THEN 'sms'
    WHEN o.type IN ('email', 'email_followup') THEN 'email'
    ELSE 'other'
  END AS channel,
  EXISTS (
    SELECT 1
    FROM public.activities i
    WHERE i.user_id = o.user_id
      AND i.customer_id = o.customer_id
      AND i.direction = 'inbound'
      AND i.created_at > o.created_at
      AND i.created_at <= o.created_at + INTERVAL '30 days'
  ) AS got_reply
FROM public.activities o
JOIN public.customers c
  ON c.id = o.customer_id
 AND c.user_id = o.user_id
WHERE o.direction = 'outbound'
  AND o.customer_id IS NOT NULL
  AND o.created_by IS NOT NULL
  AND c.assigned_to IS NOT NULL
  AND o.type IN ('call', 'sms', 'email', 'sms_followup', 'email_followup');

CREATE OR REPLACE VIEW public.v_rep_conversion_funnel
WITH (security_invoker = true) AS
WITH customer_leads AS (
  SELECT
    c.user_id AS org_id,
    c.assigned_to AS assigned_rep_id,
    c.id AS customer_id,
    MIN(a.created_at) FILTER (WHERE a.direction = 'inbound') AS first_lead_at
  FROM public.customers c
  LEFT JOIN public.activities a
    ON a.customer_id = c.id
   AND a.user_id = c.user_id
  WHERE c.assigned_to IS NOT NULL
  GROUP BY c.user_id, c.assigned_to, c.id
)
SELECT
  cl.org_id,
  cl.assigned_rep_id,
  cl.customer_id,
  cl.first_lead_at,
  EXISTS (
    SELECT 1
    FROM public.activities ap
    WHERE ap.user_id = cl.org_id
      AND ap.customer_id = cl.customer_id
      AND ap.type = 'appointment'
  ) AS has_appointment,
  EXISTS (
    SELECT 1
    FROM public.deal_intent_outcomes dio
    WHERE dio.org_id = cl.org_id
      AND dio.customer_id = cl.customer_id
  ) AS is_sold
FROM customer_leads cl
WHERE cl.first_lead_at IS NOT NULL;

CREATE OR REPLACE VIEW public.v_rep_ghost_rates
WITH (security_invoker = true) AS
SELECT
  org_id,
  assigned_rep_id,
  id AS audit_id,
  customer_id,
  archived_at,
  (archive_reason = 'ghost') AS is_ghost
FROM public.lost_lead_audit;

CREATE OR REPLACE VIEW public.v_sequence_step_dropoff
WITH (security_invoker = true) AS
WITH step_sends AS (
  SELECT
    cs.org_id,
    cs.sequence_id,
    s.name AS sequence_name,
    a.customer_id,
    COALESCE(a.sequence_day, 0) AS step_number,
    a.created_at AS sent_at,
    EXISTS (
      SELECT 1
      FROM public.activities i
      WHERE i.user_id = a.user_id
        AND i.customer_id = a.customer_id
        AND i.direction = 'inbound'
        AND i.created_at > a.created_at
        AND i.created_at <= a.created_at + INTERVAL '7 days'
    ) AS got_reply
  FROM public.activities a
  JOIN public.customer_sequences cs
    ON cs.id = a.customer_sequence_id
  LEFT JOIN public.sequences s
    ON s.id = cs.sequence_id
  WHERE a.customer_sequence_id IS NOT NULL
    AND a.direction = 'outbound'
    AND a.type IN ('sms_followup', 'email_followup', 'sms', 'email')
)
SELECT
  org_id,
  sequence_id,
  sequence_name,
  step_number,
  COUNT(*)::INT AS enrolled_count,
  COUNT(*) FILTER (WHERE NOT got_reply)::INT AS silent_after_step_count,
  ROUND(
    (COUNT(*) FILTER (WHERE NOT got_reply))::NUMERIC / NULLIF(COUNT(*), 0),
    4
  ) AS silence_rate
FROM step_sends
GROUP BY org_id, sequence_id, sequence_name, step_number;

GRANT SELECT ON public.v_rep_response_times TO authenticated;
GRANT SELECT ON public.v_rep_reply_rates TO authenticated;
GRANT SELECT ON public.v_rep_conversion_funnel TO authenticated;
GRANT SELECT ON public.v_rep_ghost_rates TO authenticated;
GRANT SELECT ON public.v_sequence_step_dropoff TO authenticated;

-- ── 3. Platform table RLS policies ──
-- SELECT: authenticated role. Writes: platform superusers only.
-- platform_social_accounts: SELECT restricted to superusers (contains OAuth secrets).

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'platform_feature_flags',
    'platform_notification_config',
    'webhook_idempotency',
    'platform_connector_config',
    'platform_content_config',
    'platform_plan_quotas',
    'platform_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_authenticated', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.role() = ''authenticated'')',
      tbl || '_select_authenticated',
      tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_superadmin', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_platform_superuser())',
      tbl || '_insert_superadmin',
      tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_superadmin', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_platform_superuser()) WITH CHECK (public.is_platform_superuser())',
      tbl || '_update_superadmin',
      tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_superadmin', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_platform_superuser())',
      tbl || '_delete_superadmin',
      tbl
    );
  END LOOP;
END $$;

-- OAuth tokens: never expose to all authenticated users via PostgREST
ALTER TABLE public.platform_social_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_social_accounts TO authenticated;

DROP POLICY IF EXISTS platform_social_accounts_select_superadmin ON public.platform_social_accounts;
CREATE POLICY platform_social_accounts_select_superadmin ON public.platform_social_accounts
  FOR SELECT
  TO authenticated
  USING (public.is_platform_superuser());

DROP POLICY IF EXISTS platform_social_accounts_insert_superadmin ON public.platform_social_accounts;
CREATE POLICY platform_social_accounts_insert_superadmin ON public.platform_social_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_superuser());

DROP POLICY IF EXISTS platform_social_accounts_update_superadmin ON public.platform_social_accounts;
CREATE POLICY platform_social_accounts_update_superadmin ON public.platform_social_accounts
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_superuser())
  WITH CHECK (public.is_platform_superuser());

DROP POLICY IF EXISTS platform_social_accounts_delete_superadmin ON public.platform_social_accounts;
CREATE POLICY platform_social_accounts_delete_superadmin ON public.platform_social_accounts
  FOR DELETE
  TO authenticated
  USING (public.is_platform_superuser());

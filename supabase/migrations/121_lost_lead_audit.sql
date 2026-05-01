-- Phase 6A — Audit Ledger + Deterministic Analytics

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS performance_cache JSONB;

CREATE TABLE IF NOT EXISTS public.lost_lead_audit (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id               UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  customer_id               UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  assigned_rep_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_human_actor_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_by               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  archive_reason            TEXT NOT NULL
                            CHECK (archive_reason IN ('ghost', 'manual', 'post_last_ditch', 'bulk')),
  loss_reason               TEXT
                            CHECK (loss_reason IN ('price', 'timing', 'competitor', 'not_ready', 'no_contact', 'other') OR loss_reason IS NULL),
  intent_tier               TEXT,
  intent_score              INT,
  lead_source               TEXT,
  touches                   INT,
  last_inbound_at           TIMESTAMPTZ,
  archived_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reinstated_at             TIMESTAMPTZ,
  reinstated_by             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reinstate_reason          TEXT,
  root_cause_json           JSONB,
  root_cause_ran_at         TIMESTAMPTZ,
  root_cause_confidence     NUMERIC(3,2),
  root_cause_needs_review   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS lost_lead_audit_org_archived_idx
  ON public.lost_lead_audit (org_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS lost_lead_audit_org_assigned_rep_idx
  ON public.lost_lead_audit (org_id, assigned_rep_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS lost_lead_audit_org_archive_reason_idx
  ON public.lost_lead_audit (org_id, archive_reason);

CREATE INDEX IF NOT EXISTS lost_lead_audit_org_loss_reason_idx
  ON public.lost_lead_audit (org_id, loss_reason);

ALTER TABLE public.lost_lead_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lost_lead_audit_select_org" ON public.lost_lead_audit;
CREATE POLICY "lost_lead_audit_select_org"
  ON public.lost_lead_audit
  FOR SELECT
  USING (org_id = get_org_id());

DROP POLICY IF EXISTS "lost_lead_audit_insert_org" ON public.lost_lead_audit;
CREATE POLICY "lost_lead_audit_insert_org"
  ON public.lost_lead_audit
  FOR INSERT
  WITH CHECK (org_id = get_org_id());

DROP POLICY IF EXISTS "lost_lead_audit_update_org" ON public.lost_lead_audit;
CREATE POLICY "lost_lead_audit_update_org"
  ON public.lost_lead_audit
  FOR UPDATE
  USING (org_id = get_org_id())
  WITH CHECK (org_id = get_org_id());

CREATE OR REPLACE VIEW public.v_rep_response_times AS
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

CREATE OR REPLACE VIEW public.v_rep_reply_rates AS
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

CREATE OR REPLACE VIEW public.v_rep_conversion_funnel AS
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

CREATE OR REPLACE VIEW public.v_rep_ghost_rates AS
SELECT
  org_id,
  assigned_rep_id,
  id AS audit_id,
  customer_id,
  archived_at,
  (archive_reason = 'ghost') AS is_ghost
FROM public.lost_lead_audit;

CREATE OR REPLACE VIEW public.v_sequence_step_dropoff AS
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

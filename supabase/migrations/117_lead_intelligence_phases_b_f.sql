-- Phase B–F: engagement, inventory demand, command center cache, deal learning

-- ── Customers: engagement + next action from LLM ─────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS avg_reply_speed_minutes DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS inbound_message_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prior_purchase_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_lead BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lead_intent_next_action TEXT;

-- ── Vehicles: demand intelligence ────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS lead_count_30d INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS appt_conversion_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS avg_intent_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS demand_signal TEXT,
  ADD COLUMN IF NOT EXISTS demand_updated_at TIMESTAMPTZ;

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_demand_signal_check;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_demand_signal_check
  CHECK (
    demand_signal IS NULL
    OR demand_signal IN ('high_demand', 'needs_price_drop', 'needs_financing_push', 'buy_signal')
  );

CREATE INDEX IF NOT EXISTS vehicles_user_demand_idx
  ON public.vehicles (user_id, demand_signal)
  WHERE demand_signal IS NOT NULL;

-- ── Org settings: learning weights + cached command center ─────────────────
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS lead_intent_weights JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS command_center_cache JSONB;

-- ── Deal outcomes for org-level learning (Phase F) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_intent_outcomes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  vehicle_id    UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  sold_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lead_intent_tier   TEXT,
  lead_intent_score  INT,
  lead_intent_flags  TEXT[],
  lead_source        TEXT,
  is_buyer      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_intent_outcomes_org_sold_idx
  ON public.deal_intent_outcomes (org_id, sold_at DESC);

ALTER TABLE public.deal_intent_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_intent_outcomes_select_org"
  ON public.deal_intent_outcomes
  FOR SELECT
  USING (org_id = get_org_id());

CREATE POLICY "deal_intent_outcomes_insert_service"
  ON public.deal_intent_outcomes
  FOR INSERT
  WITH CHECK (org_id = get_org_id());

-- Inserts from mark-sold API use authenticated dealer profile — INSERT policy above.
-- Service role bypasses RLS for cron if needed.

-- Conversation LLM scoring (Phase A): idempotency, locks, usage log, manual tier override

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_intent_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_intent_input_hash TEXT,
  ADD COLUMN IF NOT EXISTS lead_intent_score_error BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lead_intent_score_failures SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_score_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_intent_manual_tier TEXT,
  ADD COLUMN IF NOT EXISTS lead_intent_manual_expires_at TIMESTAMPTZ;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_lead_intent_manual_tier_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_lead_intent_manual_tier_check
  CHECK (
    lead_intent_manual_tier IS NULL
    OR lead_intent_manual_tier IN ('standard', 'active', 'warm', 'hot')
  );

CREATE INDEX IF NOT EXISTS customers_user_intent_scored_at_idx
  ON public.customers (user_id, lead_intent_scored_at DESC NULLS LAST);

-- Per-org LLM usage (service role writes; members read own org)
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  log_date     DATE NOT NULL DEFAULT (timezone('utc', now()))::DATE,
  event_type   TEXT NOT NULL,
  tokens_in    INT NOT NULL DEFAULT 0,
  tokens_out   INT NOT NULL DEFAULT 0,
  model        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_org_date_idx
  ON public.ai_usage_log (org_id, log_date);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_log_select_org"
  ON public.ai_usage_log
  FOR SELECT
  USING (org_id = get_org_id());

-- Inserts from application use service role (bypasses RLS). No INSERT policy for authenticated users.

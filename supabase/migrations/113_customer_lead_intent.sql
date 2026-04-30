ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_intent_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_intent_tier TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS lead_intent_summary TEXT,
  ADD COLUMN IF NOT EXISTS lead_intent_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS lead_intent_source TEXT,
  ADD COLUMN IF NOT EXISTS lead_intent_manual_note TEXT,
  ADD COLUMN IF NOT EXISTS lead_intent_updated_at TIMESTAMPTZ;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_lead_intent_tier_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_lead_intent_tier_check
  CHECK (lead_intent_tier IN ('standard', 'active', 'warm', 'hot'));

CREATE INDEX IF NOT EXISTS customers_user_intent_tier_idx
  ON public.customers (user_id, lead_intent_tier);

CREATE INDEX IF NOT EXISTS customers_user_intent_score_idx
  ON public.customers (user_id, lead_intent_score DESC);

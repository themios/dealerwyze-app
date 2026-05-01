-- Last-ditch campaign tracking: one breakup message before a lead is archived.
-- Tracked on the customer so cooldown applies across all their activities.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS last_ditch_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS customers_user_last_ditch_idx
  ON public.customers (user_id, last_ditch_sent_at)
  WHERE last_ditch_sent_at IS NOT NULL;

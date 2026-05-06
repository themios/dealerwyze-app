-- Dealer-pasted reference text (Carfax, Autocheck, KBB, etc.) for AI overview generation.
-- Not shown on the public site; combined with document AI summaries (voice_summary) in reanalyze.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS overview_enrichment_text text;

COMMENT ON COLUMN public.vehicles.overview_enrichment_text IS
  'Plain text the dealer pastes for AI context when generating the public overview; verify accuracy.';

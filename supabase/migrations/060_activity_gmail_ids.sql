-- Add Gmail threading columns to activities
-- Used by outbound email (send via org Gmail) and inbound reply routing

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id  text;

-- Index for dedup checks on inbound reply polling
CREATE INDEX IF NOT EXISTS idx_activities_gmail_message_id
  ON public.activities (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

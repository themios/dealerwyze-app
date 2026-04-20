-- ============================================================
-- Migration 098: Auto-respond sequence config + topic grouping
--
-- 1. Add topic column to sequences for UI grouping
-- 2. Add auto_respond_email/sms_sequence_id to org_settings
--    so each org can configure a default sequence that fires
--    automatically when a new lead is ingested.
-- ============================================================

-- 1. Add topic to sequences (for grouping in pickers)
ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT 'general';

-- Backfill known starter sequence names to reasonable topics
UPDATE public.sequences
  SET topic = 'new_lead'
  WHERE topic = 'general'
    AND (
      name ILIKE '%new lead%'
      OR name ILIKE '%lead follow%'
      OR name ILIKE '%lead response%'
      OR name ILIKE '%new inquiry%'
    );

UPDATE public.sequences
  SET topic = 're_inquiry'
  WHERE topic = 'general'
    AND (
      name ILIKE '%re-engage%'
      OR name ILIKE '%reengage%'
      OR name ILIKE '%re engage%'
      OR name ILIKE '%returning%'
    );

UPDATE public.sequences
  SET topic = 'post_sale'
  WHERE topic = 'general'
    AND (
      name ILIKE '%post sale%'
      OR name ILIKE '%post-sale%'
      OR name ILIKE '%after sale%'
      OR name ILIKE '%thank you%'
    );

-- 2. Add auto-respond sequence references to org_settings
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS auto_respond_email_sequence_id uuid
    REFERENCES public.sequences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_respond_sms_sequence_id uuid
    REFERENCES public.sequences(id) ON DELETE SET NULL;

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_org_settings_auto_respond_email
  ON public.org_settings(auto_respond_email_sequence_id)
  WHERE auto_respond_email_sequence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_settings_auto_respond_sms
  ON public.org_settings(auto_respond_sms_sequence_id)
  WHERE auto_respond_sms_sequence_id IS NOT NULL;

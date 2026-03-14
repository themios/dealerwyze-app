-- Migration 062: Add email_signature to org_settings
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS email_signature TEXT;

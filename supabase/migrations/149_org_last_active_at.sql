-- Migration 149: Add last_active_at to organizations for real-time activity tracking.
-- Stamped by requireProfile() on every authenticated request (fire-and-forget).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_last_active_at
  ON public.organizations (last_active_at DESC NULLS LAST);

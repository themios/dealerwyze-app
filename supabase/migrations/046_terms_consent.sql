-- Migration 046: Terms consent clickwrap — store agreement timestamp + IP on the org record.
-- Apply in Supabase SQL Editor.

-- These columns persist the moment the dealer admin checked "I agree" during signup.
-- Required for TCPA + CAN-SPAM enforceability and future ToS dispute defense.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_ip        TEXT        NULL;

COMMENT ON COLUMN organizations.terms_agreed_at IS 'UTC timestamp when the dealer admin clicked the clickwrap checkbox during signup. NULL if account predates this migration.';
COMMENT ON COLUMN organizations.terms_ip IS 'IP address of the client at the moment of ToS consent. Used for legal/dispute evidence.';

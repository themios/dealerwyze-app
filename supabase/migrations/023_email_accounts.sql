-- Multi-account email integration for per-org lead ingestion.
-- Replaces the single gmail_* columns approach with a proper table
-- so each org can connect multiple accounts across any provider.

CREATE TABLE IF NOT EXISTS email_accounts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL,
  label               TEXT,
  email               TEXT NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'imap',  -- gmail | yahoo | apple | outlook | imap

  -- Gmail OAuth path (provider='gmail' via Connect Gmail button)
  oauth_refresh_token TEXT,

  -- IMAP path (all other providers, or Gmail via app password)
  imap_host           TEXT,
  imap_port           INTEGER NOT NULL DEFAULT 993,
  imap_user           TEXT,
  imap_pass           TEXT,

  enabled             BOOLEAN NOT NULL DEFAULT true,
  last_polled_at      TIMESTAMPTZ,
  last_error          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_org ON email_accounts(org_id);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own org's accounts
CREATE POLICY "email_accounts_org" ON email_accounts FOR ALL USING (
  org_id IN (SELECT p.org_id FROM profiles p WHERE p.id = auth.uid())
);

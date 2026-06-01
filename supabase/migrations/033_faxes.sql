-- Migration 033: Fax history table
-- Apply in Supabase SQL editor.
-- Manual step: create a private Storage bucket named "fax-docs" in Supabase Storage dashboard.

CREATE TABLE IF NOT EXISTS faxes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  to_number    TEXT NOT NULL,
  from_number  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
  twilio_sid   TEXT,
  file_key     TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  num_pages    INTEGER,
  error_code   TEXT,
  error_msg    TEXT,
  customer_id  UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faxes_org_id    ON faxes(org_id);
CREATE INDEX IF NOT EXISTS idx_faxes_twilio_sid ON faxes(twilio_sid) WHERE twilio_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_faxes_customer   ON faxes(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE faxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faxes_org" ON faxes;
CREATE POLICY "faxes_org" ON faxes FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

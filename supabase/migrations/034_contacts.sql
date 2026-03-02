-- Migration 034: Contacts (suppliers, vendors, business contacts)
-- Apply in Supabase SQL editor.
-- Manual step: create a private Storage bucket named "contact-cards" in Supabase Storage dashboard.

CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  name            TEXT NOT NULL,
  company         TEXT,
  title           TEXT,
  phone           TEXT,
  email           TEXT,
  fax             TEXT,
  address         TEXT,
  website         TEXT,
  notes           TEXT,
  card_image_key  TEXT,   -- stored in 'contact-cards' bucket
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(org_id);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_org" ON contacts FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

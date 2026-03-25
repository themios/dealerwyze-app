-- Migration 082: saved_segments
-- Stores named filter presets for customer segmentation.

CREATE TABLE IF NOT EXISTS saved_segments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(name) <= 100),
  filters    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE saved_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_own_segments" ON saved_segments
  FOR ALL USING (org_id = public.get_org_id());
